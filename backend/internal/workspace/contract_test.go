package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"testing"
	"time"
)

func TestAdditionalConfigValidation(t *testing.T) {
	p := testPool(t)
	for _, c := range []Config{{Domain: ":443", URI: "https://:443", ChainID: 1}, {Domain: "example.com", URI: "https://example.com/#fragment", ChainID: 1}, {Domain: "example.com", URI: "https://user@example.com", ChainID: 1}, {Domain: "127.0.0.1", URI: "http://127.0.0.1", ChainID: 1}, {Domain: "localhost", URI: "http://localhost", ChainID: 1, Arbiters: []string{"0x0000000000000000000000000000000000000000"}}} {
		if _, e := New(p, c); e == nil {
			t.Fatalf("accepted %+v", c)
		}
	}
	if _, e := New(nil, Config{Domain: "localhost", URI: "http://localhost", ChainID: 1}); e == nil {
		t.Fatal("accepted nil pool")
	}
}
func TestListCapPersistenceAndSessionExpiry(t *testing.T) {
	p, h, ks := setup(t)
	token := login(t, h, ks[0])
	for i := 0; i < 51; i++ {
		in := terms(ks)
		in["title"] = fmt.Sprintf("Task %d", i)
		code, v := call(t, h, "POST", "/api/v1/tasks", token, in)
		expect(t, 201, code, v)
	}
	fresh, e := New(p, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1})
	if e != nil {
		t.Fatal(e)
	}
	code, v := call(t, fresh, "GET", "/api/v1/tasks", token, nil)
	expect(t, 200, code, v)
	if len(v["tasks"].([]any)) != 50 {
		t.Fatal("list not capped")
	}
	if v["tasks"].([]any)[0].(map[string]any)["manifest"].(map[string]any)["title"] != "Task 50" {
		t.Fatal("list not newest first")
	}
	hash := sha256.Sum256([]byte(token))
	if _, e = p.Exec(context.Background(), "UPDATE proofpay.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1", hash[:]); e != nil {
		t.Fatal(e)
	}
	code, v = call(t, fresh, "GET", "/api/v1/me", token, nil)
	expect(t, 401, code, v)
}
func TestFingerprintBindsEveryTerm(t *testing.T) {
	_, _, ks := setup(t)
	now := time.Now().UTC().Truncate(time.Second)
	input := terms(ks)
	b, _ := json.Marshal(input)
	var in TaskInput
	if e := json.Unmarshal(b, &in); e != nil {
		t.Fatal(e)
	}
	s := &server{cfg: Config{ChainID: 1}, arbiters: map[string]bool{addr(ks[2]): true, addr(ks[3]): true}}
	m, e := s.manifest(in, addr(ks[0]), now)
	if e != nil {
		t.Fatal(e)
	}
	canonical, _ := canonicalJSON(m)
	var base map[string]any
	if e = json.Unmarshal(canonical, &base); e != nil {
		t.Fatal(e)
	}
	for field := range base {
		var changed map[string]any
		_ = json.Unmarshal(canonical, &changed)
		changed[field] = "different"
		other, _ := canonicalJSON(changed)
		if sha256.Sum256(canonical) == sha256.Sum256(other) {
			t.Fatalf("unbound field %s", field)
		}
	}
	for _, field := range []string{"id", "title", "criteria", "amount_base_units", "revision_limit", "review_period_hours"} {
		var changed map[string]any
		_ = json.Unmarshal(canonical, &changed)
		changed["deliverables"].([]any)[0].(map[string]any)[field] = "different"
		other, _ := canonicalJSON(changed)
		if sha256.Sum256(canonical) == sha256.Sum256(other) {
			t.Fatalf("unbound deliverable %s", field)
		}
	}
	if m.PrimaryArbiterHours != 48 || m.BackupArbiterHours != 48 || m.Total != "123" || !m.InviteExpiresAt.Equal(m.DeliveryDeadline) {
		t.Fatal("manifest policy")
	}
	in.DeliveryDeadline = now.Add(89 * 24 * time.Hour)
	m, e = s.manifest(in, addr(ks[0]), now)
	if e != nil || !m.InviteExpiresAt.Equal(now.Add(72*time.Hour)) {
		t.Fatal("invitation cap")
	}
}
