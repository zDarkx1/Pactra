package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatelessServerDoesNotExposeUnbudgetedAI(t *testing.T) {
	called := false
	fallback := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true; w.WriteHeader(200) })
	h, close, err := withWorkspace(context.Background(), fallback, func(string) string { return "" })
	if err != nil {
		t.Fatal(err)
	}
	defer close()
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("POST", "/api/v1/review", nil))
	if w.Code != 503 || called {
		t.Fatalf("unbudgeted review reached fallback: code=%d called=%v", w.Code, called)
	}
}
