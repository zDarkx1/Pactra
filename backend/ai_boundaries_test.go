package backend

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestAISchema(t *testing.T) {
	s := reviewSchema()
	if !reflect.DeepEqual(s["required"], []string{"findings"}) {
		t.Fatal(s)
	}
	item := s["properties"].(map[string]any)["findings"].(map[string]any)["items"].(map[string]any)
	if item["additionalProperties"] != false || !reflect.DeepEqual(item["required"], []string{"key", "assessment", "source_excerpt", "submission_excerpt", "explanation"}) {
		t.Fatal(item)
	}
	props := item["properties"].(map[string]any)
	if len(props) != 5 || !reflect.DeepEqual(props["assessment"].(map[string]any)["enum"], []string{"supported", "concern", "uncertain"}) {
		t.Fatal(props)
	}
}
func TestAIAdditionalProviderBoundaries(t *testing.T) {
	var good map[string]any
	json.Unmarshal([]byte(goodFinding), &good)
	original := good["findings"].([]any)[0]
	for _, text := range []string{
		`{"findings":[null]}`, strings.Replace(goodFinding, `"key":"hello"`, `"key":"other"`, 1),
		strings.Replace(goodFinding, `"explanation":"Meaning is preserved."`, `"explanation":null`, 1),
		strings.Replace(goodFinding, `"explanation":"Meaning is preserved."`, `"Explanation":"Meaning is preserved."`, 1),
		strings.Replace(goodFinding, `"source_excerpt":"Hello {name}",`, "", 1),
		strings.Replace(goodFinding, `Bonjour {name}`, `Bonjour`, 1),
	} {
		h := testAI(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, envelope(text)) })
		if w := reviewCall(h, valid); w.Code != 502 {
			t.Fatal(text, w.Code)
		}
	}
	dup, _ := json.Marshal(map[string]any{"findings": []any{original, original}})
	body := payload(map[string]string{"hello": "Hello {name}", "b": "b"}, map[string]string{"hello": "Bonjour {name}", "b": "b"}, false, []string{})
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, envelope(string(dup))) })
	if w := reviewCall(h, body); w.Code != 502 {
		t.Fatal("duplicate finding", w.Code)
	}
}
func TestAI20KeysAndExplanationLimit(t *testing.T) {
	values := map[string]string{}
	findings := []finding{}
	for i := 0; i < 20; i++ {
		k := string(rune('a' + i))
		values[k] = "x"
		findings = append(findings, finding{k, "supported", "x", "x", strings.Repeat("é", 1000)})
	}
	b, _ := json.Marshal(map[string]any{"findings": findings})
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, envelope(string(b))) })
	if w := reviewCall(h, payload(values, values, false, []string{})); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
}
func TestAIFailedAttemptsCooldown(t *testing.T) {
	var calls atomic.Int32
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(500)
		io.WriteString(w, "private provider error")
	})
	w := reviewCall(h, valid)
	if w.Code != 502 || strings.Contains(w.Body.String(), "private") {
		t.Fatal(w.Code, w.Body.String())
	}
	h.mu.Lock()
	remaining := time.Until(h.next)
	h.mu.Unlock()
	if remaining < 9*time.Second || remaining > 10*time.Second {
		t.Fatal("cooldown", remaining)
	}
	if w := reviewCall(h, valid); w.Code != 429 || calls.Load() != 1 || w.Header().Get("Retry-After") != "10" {
		t.Fatal(w.Code, w.Header(), calls.Load())
	}
}
func TestAICancellation(t *testing.T) {
	entered := make(chan struct{})
	cancelled := make(chan struct{})
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) {
		io.Copy(io.Discard, r.Body)
		close(entered)
		select {
		case <-r.Context().Done():
			close(cancelled)
		case <-time.After(2 * time.Second):
		}
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r := httptest.NewRequest("POST", "/api/v1/review", strings.NewReader(valid)).WithContext(ctx)
	r.Header.Set("Content-Type", "application/json")
	done := make(chan struct{})
	go func() { h.ServeHTTP(httptest.NewRecorder(), r); close(done) }()
	<-entered
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("handler did not cancel")
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("provider did not cancel")
	}
}
func TestAIRouteAndMedia(t *testing.T) {
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) { t.Error("unexpected provider call") })
	for _, method := range []string{"GET", "HEAD", "OPTIONS"} {
		w := call(h, method, "/api/v1/review", "application/json", valid)
		if w.Code != 405 || w.Header().Get("Allow") != "POST" {
			t.Fatal(w.Code, w.Header())
		}
	}
	if w := call(h, "POST", "/api/v1/review", "text/plain", valid); w.Code != 415 {
		t.Fatal(w.Code)
	}
}
