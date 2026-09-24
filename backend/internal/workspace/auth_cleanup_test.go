package workspace

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func authCleanupSeed(t *testing.T, p *pgxpool.Pool, n int) {
	t.Helper()
	for i := 1; i <= n; i++ {
		a := fmt.Sprintf("0x%040x", i)
		for _, q := range []string{
			"INSERT INTO pactra.accounts(address) VALUES($1)",
			`INSERT INTO pactra.sessions VALUES (decode(md5($1)||md5($1),'hex'),$1,'test-only',clock_timestamp()-interval '1 hour')`,
			`INSERT INTO pactra.challenges VALUES (md5($1)::uuid,$1,'test-only',clock_timestamp()-interval '1 hour',false)`,
			`INSERT INTO pactra.challenge_limits VALUES ($1,clock_timestamp()-interval '1 hour',5)`,
		} {
			if _, err := p.Exec(context.Background(), q, a); err != nil {
				t.Fatal(err)
			}
		}
	}
}

func authCleanupExpired(t *testing.T, p *pgxpool.Pool) int {
	t.Helper()
	var n int
	err := p.QueryRow(context.Background(), `SELECT
		(SELECT count(*) FROM pactra.sessions WHERE expires_at<=clock_timestamp()) +
		(SELECT count(*) FROM pactra.challenges WHERE expires_at<=clock_timestamp()) +
		(SELECT count(*) FROM pactra.challenge_limits WHERE window_start<=clock_timestamp()-interval '1 minute')`).Scan(&n)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func TestAuthCleanupBoundedAndPreservesLiveState(t *testing.T) {
	p, h, keys := setup(t)
	aiBudgetMigration(t, p)
	tokens := make([]string, len(keys))
	for i, k := range keys {
		tokens[i] = login(t, h, k)
	}
	code, task := call(t, h, "POST", "/api/v1/tasks", tokens[0], terms(keys))
	expect(t, 201, code, task)
	id := task["id"].(string)
	code, v := call(t, h, "POST", "/api/v1/tasks/"+id+"/accept", tokens[1], map[string]string{"manifest_hash": task["manifest_hash"].(string)})
	expect(t, 200, code, v)
	// Include an unconsumed live challenge in addition to consumed live challenges.
	liveChallenge := challengeFor(t, h, keys[0])
	authCleanupSeed(t, p, 4)
	var before string
	if err := p.QueryRow(context.Background(), "SELECT row_to_json(tasks)::text FROM pactra.tasks WHERE id=$1", id).Scan(&before); err != nil {
		t.Fatal(err)
	}
	totals := AuthCleanupResult{}
	for i := 0; i < 8; i++ {
		old := authCleanupExpired(t, p)
		result, err := CleanupExpiredAuth(context.Background(), p, 2)
		if err != nil {
			t.Fatal(err)
		}
		n := result.Sessions + result.Challenges + result.ChallengeLimits
		if n > 2 || n < 0 || int(n) != old-authCleanupExpired(t, p) {
			t.Fatalf("not bounded/exact: %+v", result)
		}
		totals.Sessions += result.Sessions
		totals.Challenges += result.Challenges
		totals.ChallengeLimits += result.ChallengeLimits
	}
	if totals != (AuthCleanupResult{Sessions: 4, Challenges: 4, ChallengeLimits: 4}) {
		t.Fatal(totals)
	}
	var after string
	if err := p.QueryRow(context.Background(), "SELECT row_to_json(tasks)::text FROM pactra.tasks WHERE id=$1", id).Scan(&after); err != nil || after != before {
		t.Fatalf("task modified: %v", err)
	}
	var accounts, sessions, challenges, limits int
	if err := p.QueryRow(context.Background(), `SELECT (SELECT count(*) FROM pactra.accounts),(SELECT count(*) FROM pactra.sessions),(SELECT count(*) FROM pactra.challenges),(SELECT count(*) FROM pactra.challenge_limits)`).Scan(&accounts, &sessions, &challenges, &limits); err != nil {
		t.Fatal(err)
	}
	if accounts != 9 || sessions != 5 || challenges != 6 || limits != 5 {
		t.Fatalf("live rows/accounts changed: %d %d %d %d", accounts, sessions, challenges, limits)
	}
	for _, token := range tokens {
		code, v := call(t, h, "GET", "/api/v1/me", token, nil)
		expect(t, http.StatusOK, code, v)
	}
	code, v = call(t, h, "POST", "/api/v1/auth/verify", "", signed(t, keys[0], liveChallenge))
	expect(t, 200, code, v)
	if _, err := p.Exec(context.Background(), "UPDATE pactra.tasks SET status='cancelled' WHERE id=$1", id); err == nil {
		t.Fatal("accepted_unfunded immutability lost")
	}
}

func TestAuthCleanupValidationAndCancellation(t *testing.T) {
	p := testPool(t)
	aiBudgetMigration(t, p)
	authCleanupSeed(t, p, 1)
	for _, limit := range []int{-1, 0, 1001} {
		result, err := CleanupExpiredAuth(context.Background(), p, limit)
		if err == nil || result != (AuthCleanupResult{}) {
			t.Fatalf("limit %d: %+v %v", limit, result, err)
		}
	}
	if _, err := CleanupExpiredAuth(context.Background(), nil, 1); err == nil {
		t.Fatal("nil pool accepted")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result, err := CleanupExpiredAuth(ctx, p, 1)
	if err == nil || result != (AuthCleanupResult{}) {
		t.Fatal(result, err)
	}
	if n := authCleanupExpired(t, p); n != 3 {
		t.Fatal(n)
	}
}

func TestAuthCleanupAtomicRollback(t *testing.T) {
	p := testPool(t)
	aiBudgetMigration(t, p)
	authCleanupSeed(t, p, 1)
	if _, err := p.Exec(context.Background(), `CREATE FUNCTION pactra.cleanup_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test deletion failure'; END $$;
	CREATE TRIGGER cleanup_test_fail BEFORE DELETE ON pactra.challenge_limits FOR EACH ROW EXECUTE FUNCTION pactra.cleanup_test_fail()`); err != nil {
		t.Fatal(err)
	}
	result, err := CleanupExpiredAuth(context.Background(), p, 3)
	if err == nil || result != (AuthCleanupResult{}) {
		t.Fatal(result, err)
	}
	if n := authCleanupExpired(t, p); n != 3 {
		t.Fatalf("partial deletion: %d", n)
	}
	if _, err := p.Exec(context.Background(), "DROP TRIGGER cleanup_test_fail ON pactra.challenge_limits"); err != nil {
		t.Fatal(err)
	}
	result, err = CleanupExpiredAuth(context.Background(), p, 3)
	if err != nil || result != (AuthCleanupResult{1, 1, 1}) {
		t.Fatal(result, err)
	}
}

func TestAuthCleanupSkipsLockedRows(t *testing.T) {
	p := testPool(t)
	aiBudgetMigration(t, p)
	authCleanupSeed(t, p, 1)
	tx, err := p.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(context.Background())
	for _, table := range []string{"sessions", "challenges", "challenge_limits"} {
		if _, err := tx.Exec(context.Background(), "SELECT * FROM pactra."+table+" FOR UPDATE"); err != nil {
			t.Fatal(err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result, err := CleanupExpiredAuth(ctx, p, 3)
	if err != nil || result != (AuthCleanupResult{}) {
		t.Fatal(result, err)
	}
	// A concurrent issuer can refresh an expired challenge window before cleanup.
	if _, err := tx.Exec(context.Background(), "UPDATE pactra.challenge_limits SET window_start=clock_timestamp(),count=1"); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(context.Background()); err != nil {
		t.Fatal(err)
	}
	result, err = CleanupExpiredAuth(context.Background(), p, 3)
	if err != nil || result != (AuthCleanupResult{1, 1, 0}) {
		t.Fatal(result, err)
	}
}

func TestAuthCleanupConcurrentWorkers(t *testing.T) {
	p := testPool(t)
	aiBudgetMigration(t, p)
	authCleanupSeed(t, p, 20)
	var wg sync.WaitGroup
	results := make(chan AuthCleanupResult, 12)
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			result, err := CleanupExpiredAuth(context.Background(), p, 5)
			if err != nil {
				t.Error(err)
				return
			}
			if result.Sessions+result.Challenges+result.ChallengeLimits > 5 {
				t.Error("limit exceeded")
			}
			results <- result
		}()
	}
	wg.Wait()
	close(results)
	var deleted int64
	for result := range results {
		deleted += result.Sessions + result.Challenges + result.ChallengeLimits
	}
	// SKIP LOCKED may leave work for a following invocation; drain once.
	result, err := CleanupExpiredAuth(context.Background(), p, 1000)
	if err != nil {
		t.Fatal(err)
	}
	deleted += result.Sessions + result.Challenges + result.ChallengeLimits
	if deleted != 60 || authCleanupExpired(t, p) != 0 {
		t.Fatalf("deleted %d", deleted)
	}
	var n int
	if err := p.QueryRow(context.Background(), "SELECT count(*) FROM pactra.accounts").Scan(&n); err != nil || n != 20 {
		t.Fatal(n, err)
	}
}
