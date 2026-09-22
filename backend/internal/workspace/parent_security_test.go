package workspace

import (
	"net/http/httptest"
	"testing"
)

func TestChallengeCannotCrossConfiguredDomain(t *testing.T) {
	p, h, ks := setup(t)
	challenge := challengeFor(t, h, ks[0])
	h2, err := New(p, Config{Domain: "other.example", URI: "https://other.example", ChainID: 1})
	if err != nil {
		t.Fatal(err)
	}
	status, _ := call(t, h2, "POST", "/api/v1/auth/verify", "", signed(t, ks[0], challenge))
	if status != 401 {
		t.Fatalf("cross-domain challenge accepted: %d", status)
	}
}
func TestArbitersCannotReadUnfundedPrivateWork(t *testing.T) {
	_, h, ks := setup(t)
	buyer := login(t, h, ks[0])
	arbiter := login(t, h, ks[2])
	status, task := call(t, h, "POST", "/api/v1/tasks", buyer, terms(ks))
	if status != 201 {
		t.Fatalf("create: %d", status)
	}
	status, _ = call(t, h, "GET", "/api/v1/tasks/"+task["id"].(string), arbiter, nil)
	if status != 404 {
		t.Fatalf("pre-dispute arbiter leaked task: %d", status)
	}
	_ = httptest.NewRecorder()
}
