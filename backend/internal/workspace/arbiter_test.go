package workspace

import (
	"net/http/httptest"
	"testing"
)

func TestExactBrowserOrigin(t *testing.T) {
	_, h, ks := setup(t)
	token := login(t, h, ks[0])
	for _, origin := range []string{"https://evil.example", "http://localhost:8080/", "http://localhost:8081", "null"} {
		for _, path := range []string{"/api/v1/me", "/api/v1/auth/challenge"} {
			r := httptest.NewRequest("GET", path, nil)
			if path == "/api/v1/auth/challenge" {
				r.Method = "POST"
			}
			r.Header.Set("Origin", origin)
			r.Header.Set("Authorization", "Bearer "+token)
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			expect(t, 403, w.Code, w.Body.String())
		}
	}
	r := httptest.NewRequest("GET", "/api/v1/me", nil)
	r.Header.Set("Origin", "http://localhost:8080")
	r.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	expect(t, 200, w.Code, w.Body.String())
}

func TestArbiterScopedDisputeEvidence(t *testing.T) {
	f := deliverySetup(t, true, 2)
	h, err := New(f.p, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1})
	if err != nil {
		t.Fatal(err)
	}
	path := "/api/v1/arbiter/tasks/" + f.id + "/deliverables/proof-1/evidence"
	for _, actor := range []int{0, 1, 2, 3, 4} {
		c, v := call(t, h, "GET", path, f.tokens[actor], nil)
		expect(t, 404, c, v)
	}
	c, v := call(t, h, "GET", "/api/v1/arbiter/disputes", f.tokens[2], nil)
	expect(t, 200, c, v)
	if len(v["disputes"].([]any)) != 0 {
		t.Fatal(v)
	}
	snapshot := f.call(t, "submissions", 1, f.submitInput(0, ""), 201)
	f.call(t, "disputes", 0, f.input(1, deliveryHash(snapshot)), 201)
	for _, actor := range []int{2, 3} {
		c, v = call(t, h, "GET", path, f.tokens[actor], nil)
		expect(t, 200, c, v)
		d := v["delivery"].(map[string]any)
		if len(d["submissions"].([]any)) != 1 || len(d["disputes"].([]any)) != 1 {
			t.Fatal(v)
		}
		c, v = call(t, h, "GET", "/api/v1/arbiter/disputes?limit=1", f.tokens[actor], nil)
		expect(t, 200, c, v)
		if len(v["disputes"].([]any)) != 1 {
			t.Fatal(v)
		}
		c, v = call(t, h, "GET", "/api/v1/tasks/"+f.id, f.tokens[actor], nil)
		expect(t, 404, c, v)
		c, v = call(t, h, "GET", "/api/v1/arbiter/tasks/"+f.id+"/deliverables/other/evidence", f.tokens[actor], nil)
		expect(t, 404, c, v)
	}
	for _, actor := range []int{0, 1, 4} {
		c, v = call(t, h, "GET", path, f.tokens[actor], nil)
		expect(t, 404, c, v)
	}
	for _, actor := range []int{2, 3} {
		c, v := call(t, h, "GET", f.base+"/submissions", f.tokens[actor], nil)
		expect(t, 404, c, v)
	}
	for _, query := range []string{"limit=0", "limit=01", "limit=51", "limit=1&limit=2", "cursor=garbage", "role=arbiter"} {
		c, v := call(t, h, "GET", "/api/v1/arbiter/disputes?"+query, f.tokens[2], nil)
		expect(t, 400, c, v)
	}
	c, v = call(t, h, "GET", "/api/v1/arbiter/disputes", "", nil)
	expect(t, 401, c, v)
	c, v = call(t, h, "POST", "/api/v1/auth/challenge", "", map[string]any{"address": "0x1111111111111111111111111111111111111111", "role": "arbiter"})
	expect(t, 400, c, v)
	c, v = call(t, h, "GET", "/api/v1/arbiter/disputes", f.tokens[4], nil)
	expect(t, 200, c, v)
	if len(v["disputes"].([]any)) != 0 {
		t.Fatal(v)
	}
}
