package workspace

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	backend "pactra/backend"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Existing setup owns the base schema. These tests alone apply our migration.
func aiBudgetMigration(t *testing.T, p *pgxpool.Pool) {
	t.Helper()
	b, err := os.ReadFile("../../migrations/0004_ai_usage.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(context.Background(), string(b)); err != nil {
		t.Fatal(err)
	}
}

func aiBudgetSetup(t *testing.T) (*server, []string, []string) {
	t.Helper()
	p, h, keys := setup(t)
	aiBudgetMigration(t, p)
	s := &server{pool: p, cfg: Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1}}
	tokens, addresses := make([]string, len(keys)), make([]string, len(keys))
	for i, k := range keys {
		tokens[i], addresses[i] = login(t, h, k), addr(k)
	}
	return s, tokens, addresses
}

func aiBudgetCall(h http.Handler, token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodPost, "/api/v1/review", strings.NewReader(`{}`))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func aiBudgetCounts(t *testing.T, p *pgxpool.Pool, wantGlobal, wantWallet int) {
	t.Helper()
	var global, wallet int
	err := p.QueryRow(context.Background(), `SELECT
		COALESCE((SELECT sum(count) FROM pactra.ai_usage_global WHERE usage_day=(clock_timestamp() AT TIME ZONE 'UTC')::date),0),
		COALESCE((SELECT sum(count) FROM pactra.ai_usage_wallet WHERE usage_day=(clock_timestamp() AT TIME ZONE 'UTC')::date),0)`).Scan(&global, &wallet)
	if err != nil || global != wantGlobal || wallet != wantWallet {
		t.Fatalf("usage global=%d wallet=%d, want %d/%d: %v", global, wallet, wantGlobal, wantWallet, err)
	}
}

func TestAIBudgetDisabledAndAuthentication(t *testing.T) {
	s, tokens, _ := aiBudgetSetup(t)
	var calls atomic.Int32
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(204) })
	for _, limits := range []AIBudgetLimits{{}, {WalletDaily: 1}, {GlobalDaily: 1}, {WalletDaily: -1, GlobalDaily: 1}, {WalletDaily: 1, GlobalDaily: -1}, {WalletDaily: 101, GlobalDaily: 1000}, {WalletDaily: 1, GlobalDaily: 1001}} {
		h := s.budgetedAI(inner, limits)
		if w := aiBudgetCall(h, tokens[0]); w.Code != 503 {
			t.Fatalf("limits %+v: %d", limits, w.Code)
		}
		if w := aiBudgetCall(h, ""); w.Code != 401 {
			t.Fatalf("unauthenticated: %d", w.Code)
		}
	}
	if w := aiBudgetCall(s.budgetedAI(nil, AIBudgetLimits{1, 1}), tokens[0]); w.Code != 503 {
		t.Fatal(w.Code)
	}
	h := s.budgetedAI(inner, AIBudgetLimits{1, 1})
	for _, token := range []string{"", "invalid", strings.Repeat("0", 64)} {
		if w := aiBudgetCall(h, token); w.Code != 401 {
			t.Fatal(w.Code)
		}
	}
	hash := sha256.Sum256([]byte(tokens[0]))
	if _, err := s.pool.Exec(context.Background(), "UPDATE pactra.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1", hash[:]); err != nil {
		t.Fatal(err)
	}
	if w := aiBudgetCall(h, tokens[0]); w.Code != 401 {
		t.Fatal(w.Code)
	}
	other := &server{pool: s.pool, cfg: Config{Domain: "localhost:9999", URI: "http://localhost:9999", ChainID: 1}}
	if w := aiBudgetCall(other.budgetedAI(inner, AIBudgetLimits{1, 1}), tokens[1]); w.Code != 401 {
		t.Fatal(w.Code)
	}
	if calls.Load() != 0 {
		t.Fatal("disabled/unauthenticated request invoked inner")
	}
	aiBudgetCounts(t, s.pool, 0, 0)
}

func TestAIBudgetFailureCountsAndWalletRollback(t *testing.T) {
	s, tokens, _ := aiBudgetSetup(t)
	var calls atomic.Int32
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		// A separate pool query proves BOTH reservations committed before dispatch.
		aiBudgetCounts(t, s.pool, int(calls.Load()), int(calls.Load()))
		w.Header().Set("X-Inner", "unchanged")
		w.WriteHeader(502)
	})
	h := s.budgetedAI(inner, AIBudgetLimits{WalletDaily: 1, GlobalDaily: 2})
	if w := aiBudgetCall(h, tokens[0]); w.Code != 502 || w.Header().Get("X-Inner") != "unchanged" {
		t.Fatal(w)
	}
	if w := aiBudgetCall(h, tokens[0]); w.Code != 429 {
		t.Fatal(w.Code)
	}
	aiBudgetCounts(t, s.pool, 1, 1)
	// A newly constructed server has no resettable process-local budget.
	restarted := &server{pool: s.pool, cfg: s.cfg}
	h = restarted.budgetedAI(inner, AIBudgetLimits{1, 2})
	if w := aiBudgetCall(h, tokens[1]); w.Code != 502 {
		t.Fatal(w.Code)
	}
	if w := aiBudgetCall(h, tokens[2]); w.Code != 429 {
		t.Fatal(w.Code)
	}
	if calls.Load() != 2 {
		t.Fatal(calls.Load())
	}
	aiBudgetCounts(t, s.pool, 2, 2)
}

func TestAIBudgetConcurrentIndependentPools(t *testing.T) {
	for _, tc := range []struct {
		name   string
		limits AIBudgetLimits
		want   int
	}{
		{"wallet", AIBudgetLimits{2, 100}, 10}, {"global", AIBudgetLimits{100, 7}, 7},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, tokens, _ := aiBudgetSetup(t)
			p2, err := pgxpool.New(context.Background(), os.Getenv("TEST_DATABASE_URL"))
			if err != nil {
				t.Fatal(err)
			}
			defer p2.Close()
			s2 := &server{pool: p2, cfg: s.cfg}
			var calls atomic.Int32
			inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(204) })
			hs := []http.Handler{s.budgetedAI(inner, tc.limits), s2.budgetedAI(inner, tc.limits)}
			var wg sync.WaitGroup
			start := make(chan struct{})
			codes := make(chan int, 60)
			for i := 0; i < 60; i++ {
				wg.Add(1)
				go func(i int) { defer wg.Done(); <-start; codes <- aiBudgetCall(hs[i%2], tokens[i%len(tokens)]).Code }(i)
			}
			close(start)
			wg.Wait()
			close(codes)
			ok := 0
			for code := range codes {
				if code == 204 {
					ok++
				} else if code != 429 {
					t.Errorf("unexpected status %d", code)
				}
			}
			if ok != tc.want || int(calls.Load()) != tc.want {
				t.Fatalf("admitted %d, dispatched %d, want %d", ok, calls.Load(), tc.want)
			}
			aiBudgetCounts(t, s.pool, tc.want, tc.want)
			var over int
			if err := s.pool.QueryRow(context.Background(), "SELECT count(*) FROM pactra.ai_usage_wallet WHERE count>$1", tc.limits.WalletDaily).Scan(&over); err != nil || over != 0 {
				t.Fatalf("wallet overspend %d: %v", over, err)
			}
		})
	}
}

func TestAIBudgetUTCDayAndDurability(t *testing.T) {
	s, tokens, addresses := aiBudgetSetup(t)
	// A non-UTC session setting must not change the UTC day key.
	cfg := s.pool.Config().Copy()
	cfg.ConnConfig.RuntimeParams["timezone"] = "Pacific/Kiritimati"
	p, err := pgxpool.NewWithConfig(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer p.Close()
	s.pool = p
	for _, q := range []string{
		`INSERT INTO pactra.ai_usage_global VALUES ((clock_timestamp() AT TIME ZONE 'UTC')::date-1,1000)`,
		`INSERT INTO pactra.ai_usage_wallet VALUES ((clock_timestamp() AT TIME ZONE 'UTC')::date-1,$1,100)`,
	} {
		var err error
		if strings.Contains(q, "$1") {
			_, err = p.Exec(context.Background(), q, addresses[0])
		} else {
			_, err = p.Exec(context.Background(), q)
		}
		if err != nil {
			t.Fatal(err)
		}
	}
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(204) })
	h := s.budgetedAI(inner, AIBudgetLimits{1, 1})
	if w := aiBudgetCall(h, tokens[0]); w.Code != 204 {
		t.Fatal(w.Code)
	}
	aiBudgetCounts(t, p, 1, 1)
	if w := aiBudgetCall(h, tokens[0]); w.Code != 429 {
		t.Fatal(w.Code)
	}
	var old int
	if err := p.QueryRow(context.Background(), `SELECT count FROM pactra.ai_usage_global WHERE usage_day=(clock_timestamp() AT TIME ZONE 'UTC')::date-1`).Scan(&old); err != nil || old != 1000 {
		t.Fatalf("history changed: %d %v", old, err)
	}
}

func TestAIBudgetStorageFailureRollsBack(t *testing.T) {
	s, tokens, _ := aiBudgetSetup(t)
	var calls atomic.Int32
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(204) })
	h := s.budgetedAI(inner, AIBudgetLimits{1, 1})
	if _, err := s.pool.Exec(context.Background(), `CREATE FUNCTION pactra.ai_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test reservation failure'; END $$;
	CREATE TRIGGER ai_test_fail BEFORE INSERT ON pactra.ai_usage_wallet FOR EACH ROW EXECUTE FUNCTION pactra.ai_test_fail()`); err != nil {
		t.Fatal(err)
	}
	if w := aiBudgetCall(h, tokens[0]); w.Code != 503 || strings.Contains(w.Body.String(), "test reservation") {
		t.Fatal(w)
	}
	aiBudgetCounts(t, s.pool, 0, 0)
	if _, err := s.pool.Exec(context.Background(), "DROP TRIGGER ai_test_fail ON pactra.ai_usage_wallet"); err != nil {
		t.Fatal(err)
	}
	if w := aiBudgetCall(h, tokens[0]); w.Code != 204 {
		t.Fatal(w.Code)
	}
	if calls.Load() != 1 {
		t.Fatal(calls.Load())
	}
}

func TestAIBudgetCancellationWhileWaiting(t *testing.T) {
	s, tokens, _ := aiBudgetSetup(t)
	var calls atomic.Int32
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(204) })
	h := s.budgetedAI(inner, AIBudgetLimits{2, 2})
	if w := aiBudgetCall(h, tokens[0]); w.Code != 204 {
		t.Fatal(w.Code)
	}
	tx, err := s.pool.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	if _, err = tx.Exec(context.Background(), "SELECT * FROM pactra.ai_usage_global FOR UPDATE"); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	r := httptest.NewRequest("POST", "/api/v1/review", nil).WithContext(ctx)
	r.Header.Set("Authorization", "Bearer "+tokens[0])
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 503 || ctx.Err() == nil {
		t.Fatalf("status=%d context=%v", w.Code, ctx.Err())
	}
	if err = tx.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	aiBudgetCounts(t, s.pool, 1, 1)
	if calls.Load() != 1 {
		t.Fatal(calls.Load())
	}
}

func TestAIBudgetRealHandlerWithoutProvider(t *testing.T) {
	s, tokens, _ := aiBudgetSetup(t)
	inner := backend.NewHandler() // Real handler, empty provider configuration, no network.
	if w := aiBudgetCall(s.budgetedAI(inner, AIBudgetLimits{}), tokens[0]); w.Code != 503 {
		t.Fatal(w.Code)
	}
	aiBudgetCounts(t, s.pool, 0, 0)
	h := s.budgetedAI(inner, AIBudgetLimits{1, 1})
	w := aiBudgetCall(h, tokens[0])
	if w.Code != 503 || !strings.Contains(w.Body.String(), "ai_not_configured") {
		t.Fatal(w.Code, w.Body.String())
	}
	aiBudgetCounts(t, s.pool, 1, 1)
	if w := aiBudgetCall(h, tokens[0]); w.Code != 429 {
		t.Fatal(w.Code)
	}
}

func TestAIBudgetMigrationConstraints(t *testing.T) {
	s, _, addresses := aiBudgetSetup(t)
	for _, q := range []string{
		`INSERT INTO pactra.ai_usage_global VALUES (CURRENT_DATE,0)`,
		`INSERT INTO pactra.ai_usage_wallet VALUES (CURRENT_DATE,$1,-1)`,
		`INSERT INTO pactra.ai_usage_wallet VALUES (CURRENT_DATE,'0x0000000000000000000000000000000000000001',1)`,
	} {
		var err error
		if strings.Contains(q, "$1") {
			_, err = s.pool.Exec(context.Background(), q, addresses[0])
		} else {
			_, err = s.pool.Exec(context.Background(), q)
		}
		if err == nil {
			t.Fatal(fmt.Sprintf("accepted invalid row: %s", q))
		}
	}
}
