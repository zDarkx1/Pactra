package workspace

import (
	"context"
	"net/http/httptest"
	"os"
	"testing"
)

func TestPublicConstructorWiresPrivateDeliveryAndReview(t *testing.T) {
	p, h, ks := setup(t)
	b, e := os.ReadFile("../../migrations/0003_delivery_review.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = p.Exec(context.Background(), string(b)); e != nil {
		t.Fatal(e)
	}
	token := login(t, h, ks[0])
	code, task := call(t, h, "POST", "/api/v1/tasks", token, terms(ks))
	expect(t, 201, code, task)
	r := httptest.NewRequest("GET", "/api/v1/tasks/"+task["id"].(string)+"/deliverables/proof-1/submissions", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	expect(t, 401, w.Code, w.Body.String())
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/review", nil))
	expect(t, 401, w.Code, w.Body.String())
}
