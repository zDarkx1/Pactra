package workspace

import (
	"context"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestStrictJSONObjects(t *testing.T) {
	_, h, ks := setup(t)
	for _, body := range []string{`null`, `{"address":"` + addr(ks[0]) + `","address":"` + addr(ks[1]) + `"}`} {
		r := httptest.NewRequest("POST", "/api/v1/auth/challenge", strings.NewReader(body))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		expect(t, 400, w.Code, w.Body.String())
	}
	token := login(t, h, ks[0])
	in := terms(ks)
	in["source"] = map[string]any{"repo": nil}
	code, v := call(t, h, "POST", "/api/v1/tasks", token, in)
	expect(t, 400, code, v)
}
func TestSignatureCanonicalAndConcurrentReplay(t *testing.T) {
	_, h, ks := setup(t)
	c := challengeFor(t, h, ks[0])
	valid := signed(t, ks[0], c)
	b, _ := hex.DecodeString(valid["signature"][2:])
	high := new(big.Int).Sub(crypto.S256().Params().N, new(big.Int).SetBytes(b[32:64]))
	high.FillBytes(b[32:64])
	if b[64] == 27 {
		b[64] = 28
	} else {
		b[64] = 27
	}
	for _, sig := range []string{"0x" + hex.EncodeToString(b), "0x" + strings.Repeat("00", 65), valid["signature"][:130] + "02", "0xzz", ""} {
		code, v := call(t, h, "POST", "/api/v1/auth/verify", "", map[string]string{"challenge_id": c["challenge_id"].(string), "signature": sig})
		expect(t, 401, code, v)
	}
	var wg sync.WaitGroup
	codes := make(chan int, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, _ := call(t, h, "POST", "/api/v1/auth/verify", "", valid)
			codes <- code
		}()
	}
	wg.Wait()
	close(codes)
	success := 0
	for code := range codes {
		if code == 200 {
			success++
		} else if code != 401 {
			t.Fatalf("concurrent verification status %d", code)
		}
	}
	if success != 1 {
		t.Fatalf("created %d sessions", success)
	}
}
func TestDurableAndGlobalChallengeLimits(t *testing.T) {
	p, h, ks := setup(t)
	cfg := Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1}
	for i := 0; i < 5; i++ {
		challengeFor(t, h, ks[0])
	}
	h2, e := New(p, cfg)
	if e != nil {
		t.Fatal(e)
	}
	code, v := call(t, h2, "POST", "/api/v1/auth/challenge", "", map[string]string{"address": addr(ks[0])})
	expect(t, 429, code, v)
	if _, e = p.Exec(context.Background(), "UPDATE proofpay.challenge_limits SET window_start=clock_timestamp()-interval '61 seconds' WHERE address=$1", addr(ks[0])); e != nil {
		t.Fatal(e)
	}
	challengeFor(t, h2, ks[0])
	globalChallenges.Lock()
	globalChallenges.count = 60
	globalChallenges.start = time.Now()
	globalChallenges.Unlock()
	code, v = call(t, h2, "POST", "/api/v1/auth/challenge", "", map[string]string{"address": addr(ks[1])})
	expect(t, 429, code, v)
}
func TestTaskBoundsAndFingerprint(t *testing.T) {
	p, h, ks := setup(t)
	buyer := login(t, h, ks[0])
	worker := login(t, h, ks[1])
	for _, change := range []map[string]any{{"revision_limit": -1}, {"revision_limit": 6}, {"review_period_hours": 23}, {"review_period_hours": 169}, {"id": "BAD ID"}, {"title": ""}, {"criteria": strings.Repeat("x", 4001)}} {
		in := terms(ks)
		d := in["deliverables"].([]any)[0].(map[string]any)
		for k, v := range change {
			d[k] = v
		}
		code, v := call(t, h, "POST", "/api/v1/tasks", buyer, in)
		expect(t, 400, code, v)
	}
	in := terms(ks)
	src := map[string]string{}
	for i := 0; i < 101; i++ {
		src[fmt.Sprint(i)] = "x"
	}
	in["source"] = src
	code, v := call(t, h, "POST", "/api/v1/tasks", buyer, in)
	expect(t, 400, code, v)
	in["source"] = map[string]string{"x": strings.Repeat("x", 16384)}
	code, v = call(t, h, "POST", "/api/v1/tasks", buyer, in)
	expect(t, 400, code, v)
	in = terms(ks)
	d := in["deliverables"].([]any)[0].(map[string]any)
	in["deliverables"] = []any{d, d}
	code, v = call(t, h, "POST", "/api/v1/tasks", buyer, in)
	expect(t, 400, code, v)
	max := new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), 256), big.NewInt(1)).String()
	in = terms(ks)
	d = in["deliverables"].([]any)[0].(map[string]any)
	d["amount_base_units"] = max
	code, v = call(t, h, "POST", "/api/v1/tasks", buyer, in)
	expect(t, 201, code, v)
	in["deliverables"] = []any{d, map[string]any{"id": "second", "title": "Second", "criteria": "Done", "amount_base_units": "1", "revision_limit": 0, "review_period_hours": 24}}
	code, v = call(t, h, "POST", "/api/v1/tasks", buyer, in)
	expect(t, 400, code, v)
	// Insert an already-expired invitation through the same production validation,
	// using a past creation time (no trigger bypass or mutable task updates).
	now := time.Now().UTC().Add(-100 * time.Hour).Truncate(time.Microsecond)
	raw := TaskInput{Title: "Expired", Source: map[string]string{}, Worker: addr(ks[1]), PrimaryArbiter: addr(ks[2]), BackupArbiter: addr(ks[3]), DeliveryDeadline: now.Add(80 * time.Hour), Deliverables: []Deliverable{{ID: "x", Title: "X", Criteria: "Done", Amount: "1", ReviewPeriodHours: 24}}}
	s := &server{cfg: Config{ChainID: 1}, arbiters: map[string]bool{addr(ks[2]): true, addr(ks[3]): true}}
	m, e := s.manifest(raw, addr(ks[0]), now)
	if e != nil {
		t.Fatal(e)
	}
	b, _ := canonicalJSON(m)
	id, _ := uuid()
	hash := strings.Repeat("a", 64)
	_, e = p.Exec(context.Background(), `INSERT INTO proofpay.tasks(id,buyer,worker,primary_arbiter,backup_arbiter,manifest,manifest_json,manifest_hash,created_at,invite_expires_at,delivery_deadline) VALUES($1,$2,$3,$4,$5,$6::text::jsonb,$6::text,$7,$8,$9,$10)`, id, addr(ks[0]), addr(ks[1]), addr(ks[2]), addr(ks[3]), string(b), hash, now, m.InviteExpiresAt, m.DeliveryDeadline)
	if e != nil {
		t.Fatal(e)
	}
	code, v = call(t, h, "POST", "/api/v1/tasks/"+id+"/accept", worker, map[string]string{"manifest_hash": hash})
	expect(t, 409, code, v)
	// Every term is inside the canonical manifest and source map insertion order is irrelevant.
	m1, _ := canonicalJSON(map[string]any{"b": 1, "a": "x"})
	m2, _ := canonicalJSON(map[string]any{"a": "x", "b": 1})
	if string(m1) != string(m2) {
		t.Fatal("canonical ordering")
	}
}
func TestRuntimeRoleAndDatabaseConstraints(t *testing.T) {
	p, _, ks := setup(t)
	ctx := context.Background()
	suffix, e := randomHex(6)
	if e != nil {
		t.Fatal(e)
	}
	role := "proofpay_test_" + suffix
	ident := pgx.Identifier{role}.Sanitize()
	if _, e = p.Exec(ctx, "CREATE ROLE "+ident+" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT"); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { _, _ = p.Exec(ctx, "DROP OWNED BY "+ident); _, _ = p.Exec(ctx, "DROP ROLE "+ident) })
	if _, e = p.Exec(ctx, "GRANT USAGE ON SCHEMA proofpay TO "+ident+"; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA proofpay TO "+ident); e != nil {
		t.Fatal(e)
	}
	cfg := p.Config().Copy()
	cfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error { _, e := c.Exec(ctx, "SET ROLE "+ident); return e }
	runtime, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(runtime.Close)
	h, e := New(runtime, Config{Domain: "localhost", URI: "http://localhost", ChainID: 1, Arbiters: []string{addr(ks[2]), addr(ks[3])}})
	if e != nil {
		t.Fatal(e)
	}
	token := login(t, h, ks[0])
	code, v := call(t, h, "POST", "/api/v1/tasks", token, terms(ks))
	expect(t, 201, code, v)
	worker := login(t, h, ks[1])
	code, v = call(t, h, "POST", "/api/v1/tasks/"+v["id"].(string)+"/accept", worker, map[string]string{"manifest_hash": v["manifest_hash"].(string)})
	expect(t, 200, code, v)
	for _, query := range []string{"CREATE TABLE proofpay.denied(id int)", "CREATE TABLE public.denied(id int)", "INSERT INTO proofpay.accounts(address) VALUES('bad')", `INSERT INTO proofpay.sessions(token_hash,address,expires_at,audience) VALUES(decode(repeat('00',32),'hex'),'0x1111111111111111111111111111111111111111',now(),'["localhost","http://localhost",1]')`} {
		if _, e = runtime.Exec(ctx, query); e == nil {
			t.Fatalf("runtime accepted %s", query)
		}
	}
	var canUsePublic bool
	if e = runtime.QueryRow(ctx, "SELECT has_schema_privilege(current_user,'public','USAGE')").Scan(&canUsePublic); e != nil {
		t.Fatal(e)
	}
	if canUsePublic {
		t.Fatal("public schema grants not revoked")
	}
	disabled, e := New(runtime, Config{Domain: "localhost", URI: "http://localhost", ChainID: 1})
	if e != nil {
		t.Fatal(e)
	}
	code, v = call(t, disabled, "POST", "/api/v1/tasks", token, terms(ks))
	expect(t, 503, code, v)
}
