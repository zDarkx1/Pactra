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

const validDraftRequest = `{"brief":"Translate greeting strings, keep {name} placeholders, always include the term Pactra.","gig_type":"localization"}`

const goodDraft = `{"criteria":{"criteria_version":"criteria-v1-draft","checker_version":"localization-v1","checks":[{"id":"key_parity","params":{}},{"id":"nonempty","params":{}},{"id":"placeholders","params":{"enabled":true}},{"id":"required_terms","params":{"terms":["Pactra"]}},{"id":"human_review","params":{"prompt":"Apakah makna didukung?"}}]},"provenance":[{"field":"required_terms.terms","source":"ai"},{"field":"placeholders.enabled","source":"default"}]}`

func draftCall(h http.Handler, body string) *httptest.ResponseRecorder {
	return call(h, "POST", "/api/v1/criteria/draft", "application/json", body)
}

func TestDraftValidation(t *testing.T) {
	many := make([]string, 31)
	for i := range many {
		many[i] = "x"
	}
	terms31b, _ := json.Marshal(many)
	longPrompt := strings.Repeat("é", 501)
	cases := map[string]string{
		"unknown id":         strings.Replace(goodDraft, `"human_review"`, `"design_review"`, 1),
		"extra check key":    strings.Replace(goodDraft, `"id":"key_parity"`, `"id":"key_parity","extra":1`, 1),
		"31 terms":           strings.Replace(goodDraft, `["Pactra"]`, string(terms31b), 1),
		"blank term":         strings.Replace(goodDraft, `["Pactra"]`, `["  "]`, 1),
		"long term":          strings.Replace(goodDraft, `["Pactra"]`, `["`+strings.Repeat("x", 101)+`"]`, 1),
		"enabled not bool":   strings.Replace(goodDraft, `"enabled":true`, `"enabled":"yes"`, 1),
		"long prompt":        strings.Replace(goodDraft, `Apakah makna didukung?`, longPrompt, 1),
		"wrong version":      strings.Replace(goodDraft, `criteria-v1-draft`, `criteria-v1`, 1),
		"wrong checker":      strings.Replace(goodDraft, `localization-v1`, `localization-v2`, 1),
		"extra top-level":    strings.Replace(goodDraft, `{"criteria":`, `{"extra":1,"criteria":`, 1),
		"bad source":         strings.Replace(goodDraft, `"source":"ai"`, `"source":"model"`, 1),
		"duplicate id":       strings.Replace(goodDraft, `"id":"nonempty"`, `"id":"key_parity"`, 1),
		"duplicate key":      strings.Replace(goodDraft, `"id":"key_parity"`, `"id":"key_parity","id":"key_parity"`, 1),
		"malformed":          "{",
		"trailing":           goodDraft + ` {}`,
		"missing provenance": strings.Replace(goodDraft, `,"provenance":`, `,"source":"ai","provenance":`, 1),
	}
	for name, text := range cases {
		t.Run(name, func(t *testing.T) {
			h := testAI(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, envelope(text)) })
			w := draftCall(h, validDraftRequest)
			if w.Code != 502 || !strings.Contains(w.Body.String(), "ai_unavailable") {
				t.Fatal(w.Code, w.Body.String())
			}
			if strings.Contains(w.Body.String(), "criteria-v1-draft") {
				t.Fatal("leaked draft on failure")
			}
		})
	}
}

func TestDraftSuccess(t *testing.T) {
	var calls atomic.Int32
	h := testAI(t, func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("api-key") != "fake-test-key" || r.Header.Get("Authorization") != "" {
			t.Error("headers", r.Header)
		}
		var p map[string]any
		if json.NewDecoder(r.Body).Decode(&p) != nil {
			t.Error("payload")
		}
		if p["store"] != false || p["tools"] != nil {
			t.Error(p)
		}
		input := p["input"].([]any)
		sys := input[0].(map[string]any)
		if sys["role"] != "system" || !strings.Contains(sys["content"].(string), "untrusted") || !strings.Contains(sys["content"].(string), "draft") {
			t.Error(sys)
		}
		var user map[string]string
		if err := json.Unmarshal([]byte(input[1].(map[string]any)["content"].(string)), &user); err != nil || user["brief"] == "" || user["gig_type"] != "localization" {
			t.Error("user brief changed", user)
		}
		format := p["text"].(map[string]any)["format"].(map[string]any)
		if format["type"] != "json_schema" || format["name"] != "criteria_draft" || format["strict"] != true {
			t.Error(format)
		}
		io.WriteString(w, envelope(goodDraft))
	})
	w := draftCall(h, validDraftRequest)
	if w.Code != 200 || calls.Load() != 1 {
		t.Fatal(w.Code, w.Body.String())
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if out["advisory"] != true || out["provider"] != "azure-foundry" || out["status"] != "completed" {
		t.Fatal(out)
	}
	criteria := out["criteria"].(map[string]any)
	if criteria["criteria_version"] != "criteria-v1-draft" || criteria["checker_version"] != "localization-v1" {
		t.Fatal(criteria)
	}
}

func TestDraftHandlerStates(t *testing.T) {
	h := NewHandler()
	if w := draftCall(h, validDraftRequest); w.Code != 503 || !strings.Contains(w.Body.String(), "ai_not_configured") {
		t.Fatal(w.Code, w.Body.String())
	}
	var calls atomic.Int32
	live := testAI(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); io.WriteString(w, envelope(goodDraft)) })
	for _, method := range []string{"GET", "HEAD", "OPTIONS"} {
		if w := call(live, method, "/api/v1/criteria/draft", "application/json", validDraftRequest); w.Code != 405 || w.Header().Get("Allow") != "POST" {
			t.Fatal(method, w.Code, w.Header())
		}
	}
	if w := call(live, "POST", "/api/v1/criteria/draft", "text/plain", validDraftRequest); w.Code != 415 {
		t.Fatal(w.Code)
	}
	oversize := validDraftRequest + strings.Repeat(" ", 16*1024-len(validDraftRequest)+1)
	if w := draftCall(live, oversize); w.Code != 413 {
		t.Fatal(w.Code)
	}
	longBrief, _ := json.Marshal(map[string]string{"brief": strings.Repeat("x", 8001), "gig_type": "localization"})
	for _, body := range []string{
		"{",
		validDraftRequest + ` {}`,
		strings.Replace(validDraftRequest, `"brief":`, `"extra":1,"brief":`, 1),
		`{"brief":"  ","gig_type":"localization"}`,
		`{"brief":"x","gig_type":"code-review"}`,
		`{"brief":"x"}`,
		string(longBrief),
	} {
		if w := draftCall(live, body); w.Code != 400 {
			t.Fatalf("%d for %s", w.Code, body[:min(60, len(body))])
		}
	}
	if calls.Load() != 0 {
		t.Fatal("invalid consumed provider", calls.Load())
	}
	atLimit := validDraftRequest + strings.Repeat(" ", 16*1024-len(validDraftRequest))
	if w := draftCall(live, atLimit); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	live.mu.Lock()
	live.next = time.Now().Add(-time.Second)
	live.mu.Unlock()
	exactBrief, _ := json.Marshal(map[string]string{"brief": strings.Repeat("x", 8000), "gig_type": "localization"})
	if w := draftCall(live, string(exactBrief)); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := call(live, "POST", "/api/v1/check", "application/json", valid); w.Code != 200 {
		t.Fatal("check regressed", w.Code)
	}
}
