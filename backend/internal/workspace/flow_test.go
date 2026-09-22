package workspace

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/jackc/pgx/v5/pgxpool"
)

func call(t *testing.T, h http.Handler, method, path, token string, body any) (int, map[string]any) {
	t.Helper()
	b, _ := json.Marshal(body)
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	v := map[string]any{}
	_ = json.Unmarshal(w.Body.Bytes(), &v)
	return w.Code, v
}
func key(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	k, e := crypto.GenerateKey()
	if e != nil {
		t.Fatal(e)
	}
	return k
}
func addr(k *ecdsa.PrivateKey) string {
	return strings.ToLower(crypto.PubkeyToAddress(k.PublicKey).Hex())
}
func challengeFor(t *testing.T, h http.Handler, k *ecdsa.PrivateKey) map[string]any {
	t.Helper()
	code, c := call(t, h, "POST", "/api/v1/auth/challenge", "", map[string]string{"address": addr(k)})
	if code != 201 {
		t.Fatalf("challenge %d %v", code, c)
	}
	return c
}
func signed(t *testing.T, k *ecdsa.PrivateKey, c map[string]any) map[string]string {
	t.Helper()
	s, e := crypto.Sign(accounts.TextHash([]byte(c["message"].(string))), k)
	if e != nil {
		t.Fatal(e)
	}
	s[64] += 27
	return map[string]string{"challenge_id": c["challenge_id"].(string), "signature": "0x" + hex.EncodeToString(s)}
}
func login(t *testing.T, h http.Handler, k *ecdsa.PrivateKey) string {
	t.Helper()
	code, v := call(t, h, "POST", "/api/v1/auth/verify", "", signed(t, k, challengeFor(t, h, k)))
	if code != 200 {
		t.Fatalf("login %d %v", code, v)
	}
	return v["token"].(string)
}
func setup(t *testing.T) (*pgxpool.Pool, http.Handler, []*ecdsa.PrivateKey) {
	t.Helper()
	globalChallenges.Lock()
	globalChallenges.start = time.Time{}
	globalChallenges.count = 0
	globalChallenges.Unlock()
	challengeClients.Lock()
	challengeClients.entries = nil
	challengeClients.Unlock()
	p := testPool(t)
	ks := []*ecdsa.PrivateKey{key(t), key(t), key(t), key(t), key(t)}
	h, e := New(p, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1, Arbiters: []string{addr(ks[2]), addr(ks[3])}})
	if e != nil {
		t.Fatal(e)
	}
	return p, h, ks
}
func terms(ks []*ecdsa.PrivateKey) map[string]any {
	return map[string]any{"title": "Build a proof", "source": map[string]string{"repository": "https://example.com/repo"}, "worker": addr(ks[1]), "primary_arbiter": addr(ks[2]), "backup_arbiter": addr(ks[3]), "delivery_deadline": time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339), "deliverables": []any{map[string]any{"id": "proof-1", "title": "Proof", "criteria": "Tests pass", "amount_base_units": "123", "revision_limit": 2, "review_period_hours": 48}}}
}
func expect(t *testing.T, want, got int, v any) {
	t.Helper()
	if got != want {
		t.Fatalf("want status %d got %d: %v", want, got, v)
	}
}
func TestAuthFlow(t *testing.T) {
	p, h, ks := setup(t)
	c := challengeFor(t, h, ks[0])
	msg := c["message"].(string)
	if !strings.HasPrefix(msg, "localhost:8080 wants you to sign in with your Ethereum account:\n"+crypto.PubkeyToAddress(ks[0].PublicKey).Hex()+"\n\n") || !strings.Contains(msg, "\nURI: http://localhost:8080\nVersion: 1\nChain ID: 1\nNonce: ") {
		t.Fatal(msg)
	}
	code, v := call(t, h, "POST", "/api/v1/auth/verify", "", signed(t, ks[1], c))
	expect(t, 401, code, v)
	payload := signed(t, ks[0], c)
	code, v = call(t, h, "POST", "/api/v1/auth/verify", "", payload)
	expect(t, 200, code, v)
	token := v["token"].(string)
	hash := sha256.Sum256([]byte(token))
	var n int
	if e := p.QueryRow(context.Background(), "SELECT count(*) FROM proofpay.sessions WHERE token_hash=$1", hash[:]).Scan(&n); e != nil || n != 1 {
		t.Fatalf("hash storage %d %v", n, e)
	}
	code, v = call(t, h, "POST", "/api/v1/auth/verify", "", payload)
	expect(t, 401, code, v)
	code, v = call(t, h, "GET", "/api/v1/me", token, nil)
	expect(t, 200, code, v)
	if v["address"] != addr(ks[0]) {
		t.Fatal(v)
	}
	code, v = call(t, h, "POST", "/api/v1/auth/logout", token, map[string]any{})
	expect(t, 204, code, v)
	code, v = call(t, h, "GET", "/api/v1/me", token, nil)
	expect(t, 401, code, v)
	c = challengeFor(t, h, ks[0])
	if _, e := p.Exec(context.Background(), "UPDATE proofpay.challenges SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", c["challenge_id"]); e != nil {
		t.Fatal(e)
	}
	code, v = call(t, h, "POST", "/api/v1/auth/verify", "", signed(t, ks[0], c))
	expect(t, 401, code, v)
}
func TestTasksFlowPrivacyAndRaces(t *testing.T) {
	p, h, ks := setup(t)
	tokens := make([]string, len(ks))
	for i, k := range ks {
		tokens[i] = login(t, h, k)
	}
	code, task := call(t, h, "POST", "/api/v1/tasks", tokens[0], terms(ks))
	expect(t, 201, code, task)
	id := task["id"].(string)
	hash := task["manifest_hash"].(string)
	var canonical string
	if e := p.QueryRow(context.Background(), "SELECT manifest_json FROM proofpay.tasks WHERE id=$1", id).Scan(&canonical); e != nil {
		t.Fatal(e)
	}
	digest := sha256.Sum256([]byte(canonical))
	if hex.EncodeToString(digest[:]) != hash {
		t.Fatal("fingerprint mismatch")
	}
	for i := 0; i < 2; i++ {
		code, v := call(t, h, "GET", "/api/v1/tasks/"+id, tokens[i], nil)
		expect(t, 200, code, v)
	}
	code, v := call(t, h, "GET", "/api/v1/tasks/"+id, tokens[4], nil)
	expect(t, 404, code, v)
	code, v = call(t, h, "GET", "/api/v1/tasks", tokens[4], nil)
	expect(t, 200, code, v)
	if len(v["tasks"].([]any)) != 0 {
		t.Fatal(v)
	}
	code, v = call(t, h, "POST", "/api/v1/tasks/"+id+"/accept", tokens[0], map[string]string{"manifest_hash": hash})
	expect(t, 403, code, v)
	code, v = call(t, h, "POST", "/api/v1/tasks/"+id+"/accept", tokens[1], map[string]string{"manifest_hash": strings.Repeat("0", 64)})
	expect(t, 409, code, v)
	var wg sync.WaitGroup
	codes := make(chan int, 2)
	for _, op := range []string{"accept", "cancel"} {
		wg.Add(1)
		go func(op string) {
			defer wg.Done()
			idx := 0
			body := map[string]string{}
			if op == "accept" {
				idx = 1
				body["manifest_hash"] = hash
			}
			c, _ := call(t, h, "POST", "/api/v1/tasks/"+id+"/"+op, tokens[idx], body)
			codes <- c
		}(op)
	}
	wg.Wait()
	close(codes)
	success, conflict := 0, 0
	for c := range codes {
		if c == 200 {
			success++
		}
		if c == 409 {
			conflict++
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("race success=%d conflict=%d", success, conflict)
	}
	code, task = call(t, h, "POST", "/api/v1/tasks", tokens[0], terms(ks))
	expect(t, 201, code, task)
	id = task["id"].(string)
	code, v = call(t, h, "POST", "/api/v1/tasks/"+id+"/accept", tokens[1], map[string]string{"manifest_hash": task["manifest_hash"].(string)})
	expect(t, 200, code, v)
	if v["status"] != "accepted_unfunded" {
		t.Fatal(v)
	}
	if _, e := p.Exec(context.Background(), "UPDATE proofpay.tasks SET manifest_hash=$2 WHERE id=$1", id, strings.Repeat("0", 64)); e == nil {
		t.Fatal("DB allowed mutation")
	}
}
func TestInputAndRateLimits(t *testing.T) {
	_, h, ks := setup(t)
	token := login(t, h, ks[0])
	for i := 0; i < 4; i++ {
		challengeFor(t, h, ks[0])
	}
	code, v := call(t, h, "POST", "/api/v1/auth/challenge", "", map[string]string{"address": addr(ks[0])})
	expect(t, 429, code, v)
	for _, raw := range []string{`{"address":"` + addr(ks[1]) + `","unknown":1}`, `{"address":"` + addr(ks[1]) + `"} {}`, `{"address":"` + strings.Repeat("x", 65536) + `"}`} {
		r := httptest.NewRequest("POST", "/api/v1/auth/challenge", strings.NewReader(raw))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		expect(t, 400, w.Code, w.Body.String())
	}
	changes := []map[string]any{{"title": strings.Repeat("a", 161)}, {"worker": addr(ks[0])}, {"worker": "0x0000000000000000000000000000000000000000"}, {"primary_arbiter": addr(ks[4])}, {"delivery_deadline": time.Now().UTC().Add(30 * time.Minute).Format(time.RFC3339)}, {"delivery_deadline": time.Now().UTC().Add(91 * 24 * time.Hour).Format(time.RFC3339)}, {"source": map[string]any{"nested": map[string]string{"x": "y"}}}, {"deliverables": []any{}}}
	for _, change := range changes {
		in := terms(ks)
		for k, v := range change {
			in[k] = v
		}
		code, v := call(t, h, "POST", "/api/v1/tasks", token, in)
		expect(t, 400, code, v)
	}
	for _, amount := range []any{"0", "-1", "1.1", 1, "01", strings.Repeat("9", 79)} {
		in := terms(ks)
		in["deliverables"].([]any)[0].(map[string]any)["amount_base_units"] = amount
		code, v := call(t, h, "POST", "/api/v1/tasks", token, in)
		expect(t, 400, code, fmt.Sprint(amount, v))
	}
}
