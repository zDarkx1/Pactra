// Package backend provides Pactra's stateless localization acceptance checker.
package backend

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"
)

const maxBody = 128 * 1024

var placeholder = regexp.MustCompile(`\{[A-Za-z_][A-Za-z0-9_]*\}`)

type check struct {
	ID      string `json:"id"`
	Key     string `json:"key"`
	Status  string `json:"status"`
	Message string `json:"message"`
}
type review struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}
type result struct {
	CheckerVersion string  `json:"checker_version"`
	Passed         bool    `json:"passed"`
	Checks         []check `json:"checks"`
	AIReview       review  `json:"ai_review"`
}
type request struct {
	source, submission map[string]string
	preserve           bool
	terms              []string
}

// NewHandler returns a concurrency-safe HTTP handler with no external dependencies.
func NewHandler() http.Handler {
	h, _ := NewHandlerWithAI(AIConfig{})
	return h
}
func respond(w http.ResponseWriter, status int, v any) {
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func problem(w http.ResponseWriter, status int, code, message string) {
	respond(w, status, struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}{Error: struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{code, message}})
}
func serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	var method string
	switch r.URL.Path {
	case "/health", "/ready":
		method = http.MethodGet
	case "/api/v1/check":
		method = http.MethodPost
	default:
		problem(w, 404, "not_found", "Route not found.")
		return
	}
	if r.Method != method {
		w.Header().Set("Allow", method)
		problem(w, 405, "method_not_allowed", "Method not allowed.")
		return
	}
	switch r.URL.Path {
	case "/health":
		respond(w, 200, struct {
			Status string `json:"status"`
		}{"ok"})
		return
	case "/ready":
		respond(w, 200, struct {
			Status string `json:"status"`
			Mode   string `json:"mode"`
		}{"ready", "stateless-checker"})
		return
	}
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		problem(w, 415, "unsupported_media_type", "Content-Type must be application/json.")
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			problem(w, 413, "request_too_large", "Request exceeds 128 KiB.")
		} else {
			problem(w, 400, "invalid_request", "Invalid checker request.")
		}
		return
	}
	req, err := parseRequest(body)
	if err != nil {
		problem(w, 400, "invalid_request", "Invalid checker request.")
		return
	}
	respond(w, 200, evaluate(req))
}

var invalid = errors.New("invalid checker request")

// decodeValue checks object key uniqueness at every nesting level, including
// escaped spellings of the same key. A depth limit bounds malformed input work.
func decodeValue(d *json.Decoder, depth int) (any, error) {
	if depth > 16 {
		return nil, invalid
	}
	tok, err := d.Token()
	if err != nil {
		return nil, err
	}
	delim, ok := tok.(json.Delim)
	if !ok {
		return tok, nil
	}
	switch delim {
	case '{':
		m := make(map[string]any)
		for d.More() {
			k, err := d.Token()
			if err != nil {
				return nil, err
			}
			key, ok := k.(string)
			if !ok {
				return nil, invalid
			}
			if _, exists := m[key]; exists {
				return nil, invalid
			}
			v, err := decodeValue(d, depth+1)
			if err != nil {
				return nil, err
			}
			m[key] = v
		}
		end, err := d.Token()
		if err != nil || end != json.Delim('}') {
			return nil, invalid
		}
		return m, nil
	case '[':
		a := make([]any, 0)
		for d.More() {
			v, err := decodeValue(d, depth+1)
			if err != nil {
				return nil, err
			}
			a = append(a, v)
		}
		end, err := d.Token()
		if err != nil || end != json.Delim(']') {
			return nil, invalid
		}
		return a, nil
	default:
		return nil, invalid
	}
}
func fields(v any, names ...string) (map[string]any, error) {
	m, ok := v.(map[string]any)
	if !ok || len(m) != len(names) {
		return nil, invalid
	}
	for _, n := range names {
		if _, ok := m[n]; !ok {
			return nil, invalid
		}
	}
	return m, nil
}
func stringMap(v any) (map[string]string, error) {
	m, ok := v.(map[string]any)
	if !ok || len(m) == 0 || len(m) > 200 {
		return nil, invalid
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		s, ok := v.(string)
		if !ok || len(k) > 200 || len(s) > 4000 {
			return nil, invalid
		}
		out[k] = s
	}
	return out, nil
}
func parseRequest(body []byte) (request, error) {
	var req request
	if !utf8.Valid(body) {
		return req, invalid
	}
	d := json.NewDecoder(strings.NewReader(string(body)))
	d.UseNumber()
	v, err := decodeValue(d, 0)
	if err != nil {
		return req, invalid
	}
	if _, err = d.Token(); err != io.EOF {
		return req, invalid
	}
	root, err := fields(v, "source", "submission", "rules")
	if err != nil {
		return req, err
	}
	req.source, err = stringMap(root["source"])
	if err != nil {
		return req, err
	}
	req.submission, err = stringMap(root["submission"])
	if err != nil {
		return req, err
	}
	rules, err := fields(root["rules"], "preserve_placeholders", "required_terms")
	if err != nil {
		return req, err
	}
	preserve, ok := rules["preserve_placeholders"].(bool)
	if !ok {
		return req, invalid
	}
	req.preserve = preserve
	terms, ok := rules["required_terms"].([]any)
	if !ok || len(terms) > 30 {
		return req, invalid
	}
	for _, v := range terms {
		s, ok := v.(string)
		if !ok || strings.TrimSpace(s) == "" || len(s) > 100 {
			return req, invalid
		}
		req.terms = append(req.terms, s)
	}
	return req, nil
}
func samePlaceholders(a, b string) bool {
	counts := map[string]int{}
	for _, p := range placeholder.FindAllString(a, -1) {
		counts[p]++
	}
	for _, p := range placeholder.FindAllString(b, -1) {
		counts[p]--
	}
	for _, n := range counts {
		if n != 0 {
			return false
		}
	}
	return true
}
func evaluate(req request) result {
	out := result{CheckerVersion: "localization-v1", Passed: true, Checks: make([]check, 0), AIReview: review{"not_configured", "Semantic review is not implemented. Human review required."}}
	add := func(id, key string, pass bool, good, bad string) {
		status, msg := "pass", good
		if !pass {
			status, msg = "fail", bad
			out.Passed = false
		}
		out.Checks = append(out.Checks, check{id, key, status, msg})
	}
	union := map[string]bool{}
	for k := range req.source {
		union[k] = true
	}
	for k := range req.submission {
		union[k] = true
	}
	keys := make([]string, 0, len(union))
	for k := range union {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		source, hasSource := req.source[k]
		submission, hasSubmission := req.submission[k]
		reason := "Submission key is missing."
		if !hasSource {
			reason = "Submission key is not in source."
		}
		add("key_parity", k, hasSource && hasSubmission, "Key exists in source and submission.", reason)
		if hasSubmission {
			add("nonempty", k, strings.TrimSpace(submission) != "", "Submission is nonblank.", "Submission is empty or whitespace.")
		}
		if hasSource && hasSubmission && req.preserve {
			add("placeholders", k, samePlaceholders(source, submission), "Placeholder multisets match.", "Placeholder multisets differ.")
		}
		if hasSource {
			for _, term := range req.terms {
				if strings.Contains(source, term) {
					add("required_term", k, hasSubmission && strings.Contains(submission, term), "Required term preserved: "+term, "Required term missing: "+term)
				}
			}
		}
	}
	return out
}
