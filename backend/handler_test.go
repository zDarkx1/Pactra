package backend

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
)

const valid = `{"source":{"hello":"Hello {name}"},"submission":{"hello":"Bonjour {name}"},"rules":{"preserve_placeholders":true,"required_terms":[]}}`

func call(h http.Handler, method, path, ct, body string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if ct != "" {
		r.Header.Set("Content-Type", ct)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func payload(source, submission map[string]string, preserve bool, terms []string) string {
	b, _ := json.Marshal(map[string]any{"source": source, "submission": submission, "rules": map[string]any{"preserve_placeholders": preserve, "required_terms": terms}})
	return string(b)
}
func TestChecks(t *testing.T) {
	tests := []struct {
		name, body string
		passed     bool
		failID     string
	}{
		{"valid", valid, true, ""},
		{"missing", payload(map[string]string{"a": "x", "b": "y"}, map[string]string{"a": "x"}, true, []string{}), false, "key_parity"},
		{"extra", payload(map[string]string{"a": "x"}, map[string]string{"a": "x", "b": "y"}, true, []string{}), false, "key_parity"},
		{"placeholder missing", payload(map[string]string{"a": "{name}"}, map[string]string{"a": "hello"}, true, []string{}), false, "placeholders"},
		{"placeholder extra", payload(map[string]string{"a": "hello"}, map[string]string{"a": "{name}"}, true, []string{}), false, "placeholders"},
		{"placeholder repeated", payload(map[string]string{"a": "{n} {n}"}, map[string]string{"a": "{n}"}, true, []string{}), false, "placeholders"},
		{"placeholder swapped keys", payload(map[string]string{"a": "{x}", "b": "{y}"}, map[string]string{"a": "{y}", "b": "{x}"}, true, []string{}), false, "placeholders"},
		{"placeholder reordered", payload(map[string]string{"a": "{_x} {a2} {_x}"}, map[string]string{"a": "{a2} {_x} {_x}"}, true, []string{}), true, ""},
		{"placeholder grammar", payload(map[string]string{"a": "{2x} {a-b}"}, map[string]string{"a": "text"}, true, []string{}), true, ""},
		{"explicit false", payload(map[string]string{"a": "{name}"}, map[string]string{"a": "hello"}, false, []string{}), true, ""},
		{"required term", payload(map[string]string{"a": "Use Pactra"}, map[string]string{"a": "Use pactra"}, true, []string{"Pactra"}), false, "required_term"},
		{"term preserved substring", payload(map[string]string{"a": "xPactrax"}, map[string]string{"a": "yPactray"}, true, []string{"Pactra"}), true, ""},
		{"term only relevant key", payload(map[string]string{"a": "Pactra", "b": "hello"}, map[string]string{"a": "Pactra", "b": "bonjour"}, true, []string{"Pactra"}), true, ""},
		{"empty", payload(map[string]string{"a": "x"}, map[string]string{"a": ""}, true, []string{}), false, "nonempty"},
		{"whitespace", payload(map[string]string{"a": "x"}, map[string]string{"a": " 	\n\u2003"}, true, []string{}), false, "nonempty"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := call(NewHandler(), "POST", "/api/v1/check", "application/json", tt.body)
			if w.Code != 200 {
				t.Fatalf("status %d: %s", w.Code, w.Body.String())
			}
			var got struct {
				CheckerVersion string `json:"checker_version"`
				Passed         bool   `json:"passed"`
				Checks         []struct{ ID, Key, Status, Message string }
				AIReview       struct{ Status, Message string } `json:"ai_review"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got.CheckerVersion != "localization-v1" || got.Passed != tt.passed {
				t.Fatalf("unexpected response: %s", w.Body.String())
			}
			if got.AIReview.Status != "not_configured" || got.AIReview.Message != "Semantic review is not implemented. Human review required." {
				t.Fatal("AI contract")
			}
			found := tt.failID == ""
			for _, c := range got.Checks {
				if c.Status != "pass" && c.Status != "fail" {
					t.Fatal(c)
				}
				if c.Message == "" {
					t.Fatal("empty message")
				}
				if c.ID == tt.failID && c.Status == "fail" {
					found = true
				}
			}
			if !found {
				t.Fatalf("missing failure %s: %s", tt.failID, w.Body.String())
			}
		})
	}
}
func TestValidation(t *testing.T) {
	one := map[string]string{"a": "x"}
	mk := func(s map[string]string, terms []string) string { return payload(s, one, true, terms) }
	many := map[string]string{}
	for i := 0; i < 201; i++ {
		many[fmt.Sprint(i)] = "x"
	}
	terms := make([]string, 31)
	for i := range terms {
		terms[i] = "x"
	}
	tests := []struct {
		name, body string
		status     int
	}{
		{"malformed", `{`, 400}, {"trailing", valid + ` {}`, 400}, {"trailing junk", valid + `x`, 400},
		{"unknown", strings.Replace(valid, `"source"`, `"wat":1,"source"`, 1), 400},
		{"unknown nested", strings.Replace(valid, `"preserve_placeholders"`, `"wat":1,"preserve_placeholders"`, 1), 400},
		{"duplicate root", strings.Replace(valid, `"source"`, `"source":{},"source"`, 1), 400},
		{"duplicate source", strings.Replace(valid, `"hello":"Hello {name}"`, `"hello":"x","hello":"Hello {name}"`, 1), 400},
		{"duplicate escaped", strings.Replace(valid, `"hello":"Hello {name}"`, `"h\u0065llo":"x","hello":"Hello {name}"`, 1), 400},
		{"duplicate submission", strings.Replace(valid, `"hello":"Bonjour {name}"`, `"hello":"x","hello":"Bonjour {name}"`, 1), 400},
		{"duplicate rules", strings.Replace(valid, `"preserve_placeholders":true`, `"preserve_placeholders":false,"preserve_placeholders":true`, 1), 400},
		{"null root", `null`, 400}, {"missing", `{}`, 400},
		{"null source", strings.Replace(valid, `{"hello":"Hello {name}"}`, `null`, 1), 400},
		{"null submission", strings.Replace(valid, `{"hello":"Bonjour {name}"}`, `null`, 1), 400},
		{"null rules", `{"source":{"a":"x"},"submission":{"a":"x"},"rules":null}`, 400},
		{"missing rules", `{"source":{"a":"x"},"submission":{"a":"x"}}`, 400},
		{"null value", strings.Replace(valid, `"Hello {name}"`, `null`, 1), 400},
		{"nested value", strings.Replace(valid, `"Hello {name}"`, `{"a":"x"}`, 1), 400},
		{"numeric value", strings.Replace(valid, `"Hello {name}"`, `12`, 1), 400},
		{"array object", strings.Replace(valid, `{"hello":"Hello {name}"}`, `[]`, 1), 400},
		{"null bool", strings.Replace(valid, `:true`, `:null`, 1), 400},
		{"null terms", strings.Replace(valid, `"required_terms":[]`, `"required_terms":null`, 1), 400},
		{"null term", strings.Replace(valid, `"required_terms":[]`, `"required_terms":[null]`, 1), 400},
		{"empty source", mk(map[string]string{}, []string{}), 400},
		{"empty submission", payload(one, map[string]string{}, true, []string{}), 400},
		{"201 source keys", mk(many, []string{}), 400},
		{"201 submission keys", payload(one, many, true, []string{}), 400},
		{"long key", mk(map[string]string{strings.Repeat("k", 201): "x"}, []string{}), 400},
		{"long value", mk(map[string]string{"a": strings.Repeat("x", 4001)}, []string{}), 400},
		{"UTF8 byte limit", mk(map[string]string{"a": strings.Repeat("é", 2001)}, []string{}), 400},
		{"long submission", payload(one, map[string]string{"a": strings.Repeat("x", 4001)}, true, []string{}), 400},
		{"31 terms", mk(one, terms), 400}, {"blank term", mk(one, []string{" 	"}), 400}, {"long term", mk(one, []string{strings.Repeat("é", 51)}), 400},
		{"too large", valid + strings.Repeat(" ", 128*1024), 413},
		{"at body limit", valid + strings.Repeat(" ", 128*1024-len(valid)), 200},
		{"at value limit", mk(map[string]string{"a": strings.Repeat("x", 4000)}, []string{}), 200},
		{"at key limit", mk(map[string]string{strings.Repeat("k", 200): "x"}, []string{}), 200},
		{"invalid UTF8", strings.Replace(valid, "Hello", string([]byte{0xff}), 1), 400},
		{"case sensitive fields", strings.Replace(valid, `"source"`, `"Source"`, 1), 400},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := call(NewHandler(), "POST", "/api/v1/check", "application/json", tt.body)
			if w.Code != tt.status {
				t.Fatalf("got %d want %d: %s", w.Code, tt.status, w.Body.String())
			}
			if tt.status != 200 {
				assertError(t, w)
			}
		})
	}
}
func assertError(t *testing.T, w *httptest.ResponseRecorder) {
	t.Helper()
	var e struct {
		Error struct{ Code, Message string }
	}
	if json.Unmarshal(w.Body.Bytes(), &e) != nil || e.Error.Code == "" || e.Error.Message == "" {
		t.Fatalf("bad error: %s", w.Body.String())
	}
}
func TestHTTP(t *testing.T) {
	for _, tt := range []struct {
		method, path, ct string
		status           int
	}{
		{"GET", "/health", "", 200}, {"GET", "/ready", "", 200}, {"POST", "/health", "", 405}, {"HEAD", "/health", "", 405}, {"POST", "/ready", "", 405}, {"GET", "/api/v1/check", "", 405}, {"OPTIONS", "/api/v1/check", "", 405}, {"POST", "/api/v1/check", "", 415}, {"POST", "/api/v1/check", "text/plain", 415}, {"POST", "/api/v1/check", "application/json; charset=utf-8", 200}, {"GET", "/unknown", "", 404},
	} {
		t.Run(tt.method+tt.path+tt.ct, func(t *testing.T) {
			w := call(NewHandler(), tt.method, tt.path, tt.ct, valid)
			if w.Code != tt.status {
				t.Fatalf("status %d", w.Code)
			}
			if w.Header().Get("X-Content-Type-Options") != "nosniff" || w.Header().Get("Content-Type") != "application/json" {
				t.Fatal(w.Header())
			}
			for k := range w.Header() {
				if strings.HasPrefix(k, "Access-Control-") {
					t.Fatal("CORS header")
				}
			}
			if tt.status == 405 && w.Header().Get("Allow") == "" {
				t.Fatal("missing Allow")
			}
			if tt.status >= 400 {
				assertError(t, w)
			}
			if tt.path == "/health" && tt.status == 200 && strings.TrimSpace(w.Body.String()) != `{"status":"ok"}` {
				t.Fatal(w.Body.String())
			}
			if tt.path == "/ready" && tt.status == 200 {
				var m map[string]string
				_ = json.Unmarshal(w.Body.Bytes(), &m)
				if m["status"] != "ready" || m["mode"] != "stateless-checker" {
					t.Fatal(m)
				}
			}
		})
	}
}
func TestDeterministicConcurrent(t *testing.T) {
	h := NewHandler()
	body := payload(map[string]string{"z": "{n} Pactra", "a": "x"}, map[string]string{"z": "{n} Pactra", "a": "x"}, true, []string{"Pactra"})
	want := call(h, "POST", "/api/v1/check", "application/json", body).Body.Bytes()
	var got struct{ Checks []struct{ ID, Key string } }
	_ = json.Unmarshal(want, &got)
	ids := []string{}
	for _, c := range got.Checks {
		ids = append(ids, c.Key+":"+c.ID)
	}
	if strings.Join(ids, ",") != "a:key_parity,a:nonempty,a:placeholders,z:key_parity,z:nonempty,z:placeholders,z:required_term" {
		t.Fatal(ids)
	}
	var wg sync.WaitGroup
	for i := 0; i < 40; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 10; j++ {
				w := call(h, "POST", "/api/v1/check", "application/json", body)
				if w.Code != 200 || !bytes.Equal(want, w.Body.Bytes()) {
					t.Error("nondeterministic response")
				}
			}
		}()
	}
	wg.Wait()
}
