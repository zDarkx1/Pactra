package backend

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

const goodFinding = `{"findings":[{"key":"hello","assessment":"supported","source_excerpt":"Hello {name}","submission_excerpt":"Bonjour {name}","explanation":"Meaning is preserved."}]}`

func envelope(text string) string {
	b, _ := json.Marshal(map[string]any{"status": "completed", "output": []any{map[string]any{"type": "message", "role": "assistant", "status": "completed", "content": []any{map[string]any{"type": "output_text", "text": text, "annotations": []any{}}}}}})
	return string(b)
}
func testAI(t *testing.T, f http.HandlerFunc) *aiHandler {
	t.Helper()
	s := httptest.NewServer(f)
	t.Cleanup(s.Close)
	h, err := NewHandlerWithAI(AIConfig{Endpoint: "https://unit.services.ai.azure.com/openai/v1/responses", Model: "unit-model", APIKey: "fake-test-key"})
	if err != nil {
		t.Fatal(err)
	}
	a := h.(*aiHandler)
	a.endpoint = s.URL + "/openai/v1/responses"
	return a
}
func reviewCall(h http.Handler, body string) *httptest.ResponseRecorder {
	return call(h, "POST", "/api/v1/review", "application/json", body)
}
func TestAIDisabled(t *testing.T) {
	for _, h := range []http.Handler{NewHandler(), func() http.Handler {
		h, e := NewHandlerWithAI(AIConfig{})
		if e != nil {
			t.Fatal(e)
		}
		return h
	}()} {
		w := reviewCall(h, valid)
		if w.Code != 503 || !strings.Contains(w.Body.String(), "ai_not_configured") {
			t.Fatal(w.Code, w.Body.String())
		}
	}
}
func TestAIEndpoint(t *testing.T) {
	for _, endpoint := range []string{"http://unit.services.ai.azure.com/openai/v1/responses", "https://services.ai.azure.com/openai/v1/responses", "https://unit.services.ai.azure.com.evil.test/openai/v1/responses", "https://user@unit.services.ai.azure.com/openai/v1/responses", "https://unit.services.ai.azure.com/openai/v1/responses?", "https://unit.services.ai.azure.com/openai/v1/responses#", "https://unit.services.ai.azure.com/openai/v1/responses/", "https://unit.services.ai.azure.com:444/openai/v1/responses", "https://unit.services.ai.azure.com/openai/v1/%72esponses"} {
		if _, e := NewHandlerWithAI(AIConfig{Endpoint: endpoint, Model: "m", APIKey: "k"}); e == nil {
			t.Errorf("accepted %s", endpoint)
		}
	}
	for _, cfg := range []AIConfig{{Model: "m"}, {Endpoint: "https://unit.services.ai.azure.com/openai/v1/responses", APIKey: "k"}} {
		if _, e := NewHandlerWithAI(cfg); e == nil {
			t.Fatal("partial config")
		}
	}
}
func TestAIPayloadAndSuccess(t *testing.T) {
	var calls atomic.Int32
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/openai/v1/responses" || r.Method != "POST" || r.Header.Get("api-key") != "fake-test-key" || r.Header.Get("Authorization") != "" || r.Header.Get("Content-Type") != "application/json" {
			t.Error("headers/method", r.Header)
		}
		var p map[string]any
		if json.NewDecoder(r.Body).Decode(&p) != nil {
			t.Error("payload")
		}
		if p["model"] != "unit-model" || p["store"] != false || p["max_output_tokens"] != float64(2500) || p["tools"] != nil {
			t.Error(p)
		}
		input := p["input"].([]any)
		sys := input[0].(map[string]any)
		if sys["role"] != "system" || !strings.Contains(sys["content"].(string), "untrusted") || !strings.Contains(sys["content"].(string), "full") {
			t.Error(sys)
		}
		if input[1].(map[string]any)["content"] != valid {
			t.Error("user JSON changed")
		}
		format := p["text"].(map[string]any)["format"].(map[string]any)
		if format["type"] != "json_schema" || format["name"] != "review" || format["strict"] != true {
			t.Error(format)
		}
		schema := format["schema"].(map[string]any)
		if schema["additionalProperties"] != false {
			t.Error(schema)
		}
		io.WriteString(w, envelope(goodFinding))
	})
	if h.client.Timeout != 30*time.Second {
		t.Fatal("timeout")
	}
	if w := call(h, "POST", "/api/v1/check", "application/json", valid); w.Code != 200 || calls.Load() != 0 {
		t.Fatal("check called AI")
	}
	w := reviewCall(h, valid)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var out map[string]any
	json.Unmarshal(w.Body.Bytes(), &out)
	if out["advisory"] != true || out["provider"] != "azure-foundry" || out["model"] != "unit-model" || out["status"] != "completed" {
		t.Fatal(out)
	}
}
func TestAIRejectProvider(t *testing.T) {
	for name, text := range map[string]string{"fabricated": envelope(strings.Replace(goodFinding, "Hello {name}", "invented", 1)), "missing": envelope(`{"findings":[]}`), "unknown": envelope(strings.Replace(goodFinding, `"key":`, `"extra":1,"key":`, 1)), "duplicate": envelope(strings.Replace(goodFinding, `"key":`, `"key":"hello","key":`, 1)), "trailing": envelope(goodFinding + ` {}`), "refusal": `{"status":"completed","output":[{"type":"message","content":[{"type":"refusal","refusal":"no"}]}]}`, "incomplete": `{"status":"incomplete","output":[]}`, "malformed": "{", "oversize": strings.Repeat("x", 256*1024+1), "outer trailing": envelope(goodFinding) + ` {}`, "outer unknown": strings.Replace(envelope(goodFinding), `"status":`, `"surprise":1,"status":`, 1), "assessment": envelope(strings.Replace(goodFinding, "supported", "approved", 1)), "blank explanation": envelope(strings.Replace(goodFinding, "Meaning is preserved.", " ", 1)), "long explanation": envelope(strings.Replace(goodFinding, "Meaning is preserved.", strings.Repeat("é", 1001), 1))} {
		t.Run(name, func(t *testing.T) {
			h := testAI(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, text) })
			w := reviewCall(h, valid)
			if w.Code != 502 || !strings.Contains(w.Body.String(), "ai_unavailable") {
				t.Fatal(w.Code, w.Body.String())
			}
		})
	}
}
func TestAIRedirectTimeoutAndRate(t *testing.T) {
	var reached atomic.Int32
	dest := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { reached.Add(1) }))
	defer dest.Close()
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, dest.URL, 307) })
	if w := reviewCall(h, valid); w.Code != 502 || reached.Load() != 0 {
		t.Fatal(w.Code, reached.Load())
	}
	h = testAI(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(time.Second):
		}
	})
	h.client.Timeout = 20 * time.Millisecond
	if w := reviewCall(h, valid); w.Code != 504 {
		t.Fatal(w.Code, w.Body.String())
	}
	h = testAI(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Retry-After", "999999")
		w.WriteHeader(429)
	})
	if w := reviewCall(h, valid); w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Fatal(w.Code, w.Header())
	}
}
func TestAIConcurrencyCooldown(t *testing.T) {
	entered, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int32
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			close(entered)
			<-release
		}
		io.WriteString(w, envelope(goodFinding))
	})
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { done <- reviewCall(h, valid) }()
	<-entered
	if w := reviewCall(h, valid); w.Code != 429 || w.Header().Get("Retry-After") == "" {
		t.Error(w.Code)
	}
	close(release)
	if w := <-done; w.Code != 200 {
		t.Fatal(w.Code)
	}
	if w := reviewCall(h, valid); w.Code != 429 || calls.Load() != 1 {
		t.Fatal(w.Code, calls.Load())
	}
	h.mu.Lock()
	h.next = time.Now().Add(-time.Second)
	h.mu.Unlock()
	if w := reviewCall(h, valid); w.Code != 200 || calls.Load() != 2 {
		t.Fatal(w.Code)
	}
}
func TestAIRequestLimits(t *testing.T) {
	many := map[string]string{}
	for i := 0; i < 21; i++ {
		many[string(rune('a'+i))] = "x"
	}
	one := map[string]string{"a": "x"}
	for _, tt := range []struct {
		body string
		code int
	}{{"{", 400}, {valid + ` {}`, 400}, {strings.Replace(valid, `"source":`, `"extra":1,"source":`, 1), 400}, {payload(many, one, false, []string{}), 400}, {payload(one, many, false, []string{}), 400}, {payload(one, map[string]string{"b": "x"}, false, []string{}), 400}, {valid + strings.Repeat(" ", 16*1024-len(valid)+1), 413}} {
		var calls atomic.Int32
		h := testAI(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); io.WriteString(w, envelope(goodFinding)) })
		if w := reviewCall(h, tt.body); w.Code != tt.code || calls.Load() != 0 {
			t.Fatal(w.Code, tt.code)
		}
		if w := reviewCall(h, valid); w.Code != 200 {
			t.Fatal("invalid consumed slot", w.Code)
		}
	}
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, envelope(goodFinding)) })
	if w := reviewCall(h, valid+strings.Repeat(" ", 16*1024-len(valid))); w.Code != 200 {
		t.Fatal(w.Code)
	}
}
func TestAIFullIntersectionBlankAndSorted(t *testing.T) {
	body := payload(map[string]string{"z": "", "a": "x", "source-only": "x"}, map[string]string{"z": " ", "a": "y", "submission-only": "x"}, false, []string{})
	text := `{"findings":[{"key":"z","assessment":"concern","source_excerpt":"","submission_excerpt":" ","explanation":"Blank values."},{"key":"a","assessment":"uncertain","source_excerpt":"x","submission_excerpt":"y","explanation":"Insufficient context."}]}`
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, envelope(text)) })
	w := reviewCall(h, body)
	if w.Code != 200 || strings.Index(w.Body.String(), `"key":"a"`) > strings.Index(w.Body.String(), `"key":"z"`) {
		t.Fatal(w.Code, w.Body.String())
	}
}
