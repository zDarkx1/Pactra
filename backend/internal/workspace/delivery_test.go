package workspace

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	checker "pactra/backend"
)

type deliveryFixture struct {
	p              *pgxpool.Pool
	h              http.Handler
	base, id, hash string
	tokens         []string
}

func deliverySetup(t *testing.T, accepted bool, limit int) deliveryFixture {
	t.Helper()
	p, parent, ks := setup(t)
	migration, err := os.ReadFile("../../migrations/0003_delivery_review.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(context.Background(), string(migration)); err != nil {
		t.Fatal(err)
	}
	tokens := make([]string, len(ks))
	for i, k := range ks {
		tokens[i] = login(t, parent, k)
	}
	in := terms(ks)
	in["deliverables"].([]any)[0].(map[string]any)["revision_limit"] = limit
	code, task := call(t, parent, "POST", "/api/v1/tasks", tokens[0], in)
	expect(t, 201, code, task)
	id, hash := task["id"].(string), task["manifest_hash"].(string)
	if accepted {
		code, body := call(t, parent, "POST", "/api/v1/tasks/"+id+"/accept", tokens[1], map[string]string{"manifest_hash": hash})
		expect(t, 200, code, body)
	}
	s := &server{pool: p, cfg: Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1}}
	mux := http.NewServeMux()
	s.registerDelivery(mux)
	return deliveryFixture{p: p, h: mux, base: "/api/v1/tasks/" + id + "/deliverables/proof-1", id: id, hash: hash, tokens: tokens}
}
func deliveryRequest(h http.Handler, method, path, token, raw string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(raw))
	r.Header.Set("Content-Type", "application/json")
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func (f deliveryFixture) call(t *testing.T, operation string, actor int, in map[string]any, want int) map[string]any {
	t.Helper()
	method := "POST"
	if in == nil {
		method = "GET"
	}
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	w := deliveryRequest(f.h, method, f.base+"/"+operation, f.tokens[actor], string(raw))
	expect(t, want, w.Code, w.Body.String())
	var out map[string]any
	if err = json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("missing no-store")
	}
	return out
}
func (f deliveryFixture) input(version int, hash string) map[string]any {
	id, err := uuid()
	if err != nil {
		panic(err)
	}
	return map[string]any{"idempotency_key": id, "unfunded_review": true, "manifest_hash": f.hash, "expected_version": version, "artifact_hash": hash, "notes": ""}
}
func (f deliveryFixture) submitInput(version int, hash string) map[string]any {
	in := f.input(version, hash)
	in["artifact"] = map[string]string{"repository": "translated repository"}
	return in
}
func deliveryHash(snapshot map[string]any) string { return snapshot["latest_artifact_hash"].(string) }
func deliveryState(t *testing.T, snapshot map[string]any, state string, version int) {
	t.Helper()
	if snapshot["state"] != state || snapshot["latest_version"] != float64(version) || snapshot["task_status"] != "accepted_unfunded" || snapshot["unfunded_review"] != true {
		t.Fatal(snapshot)
	}
}
func TestDeliveryLifecycleAndRealChecker(t *testing.T) {
	f := deliverySetup(t, true, 2)
	empty := f.call(t, "submissions", 0, nil, 200)
	deliveryState(t, empty, "not_submitted", 0)
	in := f.submitInput(0, "")
	// A deliberately blank artifact must persist real checker failure, not invented success.
	in["artifact"] = map[string]string{"repository": ""}
	first := f.call(t, "submissions", 1, in, 201)
	deliveryState(t, first, "submitted", 1)
	entry := first["submissions"].([]any)[0].(map[string]any)
	canonical, _ := json.Marshal(in["artifact"])
	digest := sha256.Sum256(canonical)
	if entry["artifact_hash"] != hex.EncodeToString(digest[:]) || entry["manifest_hash"] != f.hash {
		t.Fatal(entry)
	}
	actual := entry["checker"].(map[string]any)
	request, _ := json.Marshal(map[string]any{"source": map[string]string{"repository": "https://example.com/repo"}, "submission": in["artifact"], "rules": map[string]any{"preserve_placeholders": false, "required_terms": []string{}}})
	w := deliveryRequest(checker.NewHandler(), "POST", "/api/v1/check", "", string(request))
	var output any
	if err := json.Unmarshal(w.Body.Bytes(), &output); err != nil {
		t.Fatal(err)
	}
	if actual["http_status"] != float64(w.Code) || actual["policy"] != "default_metadata_only" || !reflect.DeepEqual(actual["output"], output) || actual["output"].(map[string]any)["passed"] != false {
		t.Fatal(actual, w.Body.String())
	}
	review := f.input(1, deliveryHash(first))
	review["decision"] = "request_revision"
	revision := f.call(t, "reviews", 0, review, 201)
	deliveryState(t, revision, "revision_requested", 1)
	second := f.call(t, "submissions", 1, f.submitInput(1, deliveryHash(first)), 201)
	deliveryState(t, second, "submitted", 2)
	// Exact replay returns its original snapshot even though review has moved on.
	replay := f.call(t, "submissions", 1, in, 201)
	if !reflect.DeepEqual(first, replay) {
		t.Fatal("replay changed")
	}
	in["notes"] = "changed"
	f.call(t, "submissions", 1, in, 409)
	stale := f.input(1, deliveryHash(first))
	stale["decision"] = "accept"
	f.call(t, "reviews", 0, stale, 409)
	accept := f.input(2, deliveryHash(second))
	accept["decision"] = "accept"
	accepted := f.call(t, "reviews", 0, accept, 201)
	deliveryState(t, accepted, "accepted", 2)
	for _, actor := range []int{0, 1} {
		f.call(t, "disputes", actor, f.input(2, deliveryHash(second)), 409)
	}
	f.call(t, "submissions", 1, f.submitInput(2, deliveryHash(second)), 409)
	accept["idempotency_key"], _ = uuid()
	f.call(t, "reviews", 0, accept, 409)
	var status string
	if err := f.p.QueryRow(context.Background(), "SELECT status FROM pactra.tasks WHERE id=$1", f.id).Scan(&status); err != nil || status != "accepted_unfunded" {
		t.Fatal(status, err)
	}
	got := f.call(t, "submissions", 1, nil, 200)
	if !reflect.DeepEqual(got, accepted) || len(got["reviews"].([]any)) != 2 || len(got["submissions"].([]any)) != 2 {
		t.Fatal(got)
	}
}
func TestDeliveryPrivacyRolesAndEligibility(t *testing.T) {
	f := deliverySetup(t, true, 1)
	for _, actor := range []int{2, 3, 4} {
		f.call(t, "submissions", actor, nil, 404)
		f.call(t, "submissions", actor, f.submitInput(0, ""), 404)
		f.call(t, "reviews", actor, func() map[string]any { in := f.input(1, strings.Repeat("a", 64)); in["decision"] = "accept"; return in }(), 404)
		f.call(t, "disputes", actor, f.input(1, strings.Repeat("a", 64)), 404)
	}
	w := deliveryRequest(f.h, "GET", f.base+"/submissions", "", "")
	expect(t, 401, w.Code, w.Body.String())
	f.call(t, "submissions", 0, f.submitInput(0, ""), 403)
	f.call(t, "disputes", 0, f.input(0, ""), 409)
	sub := f.call(t, "submissions", 1, f.submitInput(0, ""), 201)
	review := f.input(1, deliveryHash(sub))
	review["decision"] = "accept"
	f.call(t, "reviews", 1, review, 403)
	missing := f
	missing.base = strings.Replace(f.base, "proof-1", "missing", 1)
	missing.call(t, "submissions", 0, nil, 404)
	f = deliverySetup(t, false, 1)
	f.call(t, "submissions", 0, nil, 409)
	f.call(t, "submissions", 1, f.submitInput(0, ""), 409)
	if _, err := f.p.Exec(context.Background(), "UPDATE pactra.tasks SET status='cancelled' WHERE id=$1", f.id); err != nil {
		t.Fatal(err)
	}
	f.call(t, "submissions", 0, nil, 409)
	f.call(t, "submissions", 1, f.submitInput(0, ""), 409)
}
func TestDeliveryRevisionLimitAndDisputeFreeze(t *testing.T) {
	for _, actor := range []int{0, 1} {
		t.Run(fmt.Sprint(actor), func(t *testing.T) {
			f := deliverySetup(t, true, 1)
			sub := f.call(t, "submissions", 1, f.submitInput(0, ""), 201)
			f.call(t, "submissions", 1, f.submitInput(1, deliveryHash(sub)), 409)
			review := f.input(1, deliveryHash(sub))
			review["decision"] = "request_revision"
			f.call(t, "reviews", 0, review, 201)
			if actor == 0 {
				sub = f.call(t, "submissions", 1, f.submitInput(1, deliveryHash(sub)), 201)
				review = f.input(2, deliveryHash(sub))
				review["decision"] = "request_revision"
				f.call(t, "reviews", 0, review, 409)
			}
			version := int(sub["latest_version"].(float64))
			dispute := f.input(version, deliveryHash(sub))
			dispute["notes"] = "Participant reports an issue; not adjudicated."
			frozen := f.call(t, "disputes", actor, dispute, 201)
			deliveryState(t, frozen, "disputed", version)
			if frozen["disputes"].([]any)[0].(map[string]any)["evidence_flag"] != true {
				t.Fatal(frozen)
			}
			f.call(t, "submissions", 1, f.submitInput(version, deliveryHash(sub)), 409)
			review = f.input(version, deliveryHash(sub))
			review["decision"] = "accept"
			f.call(t, "reviews", 0, review, 409)
			// The other participant cannot replay this actor's successful mutation.
			f.call(t, "disputes", 1-actor, dispute, 409)
			if !reflect.DeepEqual(frozen, f.call(t, "disputes", actor, dispute, 201)) {
				t.Fatal("dispute replay")
			}
		})
	}
	f := deliverySetup(t, true, 0)
	sub := f.call(t, "submissions", 1, f.submitInput(0, ""), 201)
	review := f.input(1, deliveryHash(sub))
	review["decision"] = "request_revision"
	f.call(t, "reviews", 0, review, 409)
}
func TestDeliveryStrictInput(t *testing.T) {
	f := deliverySetup(t, true, 2)
	good := f.submitInput(0, "")
	delete(good, "artifact")
	prefix, _ := json.Marshal(good)
	prefix = prefix[:len(prefix)-1]
	badArtifacts := []string{`null`, `[]`, `{"a":1}`, `{"a":null}`, `{"a":{}}`, `{"a":[]}`, `{"a":"x","a":"y"}`, `{"a":"x","\u0061":"y"}`, `{"a":"\ud800"}`, `{"a":"\udc00"}`, `{"\u0000":"x"}`, `{"a":"\u0000"}`, `{"":"x"}`, `{"a":"` + string([]byte{0xff}) + `"}`, `{"a":"` + strings.Repeat("a", 16<<10) + `"}`, "{" + strings.Repeat(" ", 16<<10) + `"a":"x"}`}
	many := map[string]string{}
	for i := 0; i < 101; i++ {
		many[fmt.Sprint(i)] = "v"
	}
	raw, _ := json.Marshal(many)
	badArtifacts = append(badArtifacts, string(raw))
	for i, artifact := range badArtifacts {
		t.Run(fmt.Sprint(i), func(t *testing.T) {
			w := deliveryRequest(f.h, "POST", f.base+"/submissions", f.tokens[1], string(prefix)+`,"artifact":`+artifact+`}`)
			expect(t, 400, w.Code, w.Body.String())
		})
	}
	for _, change := range []map[string]any{{"unfunded_review": false}, {"unfunded_review": nil}, {"expected_version": -1}, {"expected_version": 1.5}, {"artifact_hash": "BAD"}, {"manifest_hash": "BAD"}, {"notes": strings.Repeat("a", 2001)}, {"notes": "\x00"}, {"idempotency_key": "BAD"}, {"unknown": true}, {"Artifact": map[string]string{"a": "b"}}} {
		in := f.submitInput(0, "")
		for k, v := range change {
			in[k] = v
		}
		f.call(t, "submissions", 1, in, 400)
	}
	for _, field := range []string{"unfunded_review", "expected_version", "artifact_hash", "manifest_hash", "idempotency_key", "artifact"} {
		in := f.submitInput(0, "")
		delete(in, field)
		f.call(t, "submissions", 1, in, 400)
	}
	raw, _ = json.Marshal(f.submitInput(0, ""))
	for _, body := range []string{string(raw) + " {}", string(raw[:len(raw)-1]) + `,"notes":"duplicate"}`, string(raw[:len(raw)-1]) + `,"unfunded_review":true}`} {
		w := deliveryRequest(f.h, "POST", f.base+"/submissions", f.tokens[1], body)
		expect(t, 400, w.Code, w.Body.String())
	}
	w := deliveryRequest(f.h, "POST", f.base+"/submissions", f.tokens[1], strings.Repeat(" ", 65537))
	expect(t, 413, w.Code, w.Body.String())
	r := httptest.NewRequest("POST", f.base+"/submissions", bytes.NewReader(raw))
	r.Header.Set("Authorization", "Bearer "+f.tokens[1])
	w = httptest.NewRecorder()
	f.h.ServeHTTP(w, r)
	expect(t, 415, w.Code, w.Body.String())
	// Canonical equivalence of order, escapes and omitted optional notes.
	in := f.submitInput(0, "")
	in["artifact"] = json.RawMessage(`{"z":"\ud83d\ude00","a":"ok"}`)
	delete(in, "notes")
	first := f.call(t, "submissions", 1, in, 201)
	in["artifact"] = map[string]string{"a": "ok", "z": "😀"}
	in["notes"] = ""
	if !reflect.DeepEqual(first, f.call(t, "submissions", 1, in, 201)) {
		t.Fatal("not canonical")
	}
}
func TestDeliveryConcurrentMutationsAndImmutableHistory(t *testing.T) {
	f := deliverySetup(t, true, 2)
	in := f.submitInput(0, "")
	run := func(inputs []map[string]any, ops []string, actors []int) []int {
		var wg sync.WaitGroup
		codes := make([]int, len(inputs))
		start := make(chan struct{})
		for i := range inputs {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				<-start
				raw, _ := json.Marshal(inputs[i])
				w := deliveryRequest(f.h, "POST", f.base+"/"+ops[i], f.tokens[actors[i]], string(raw))
				codes[i] = w.Code
			}(i)
		}
		close(start)
		wg.Wait()
		return codes
	}
	if codes := run([]map[string]any{in, in}, []string{"submissions", "submissions"}, []int{1, 1}); !reflect.DeepEqual(codes, []int{201, 201}) {
		t.Fatal(codes)
	}
	sub := f.call(t, "submissions", 0, nil, 200)
	if len(sub["submissions"].([]any)) != 1 {
		t.Fatal(sub)
	}
	review := f.input(1, deliveryHash(sub))
	review["decision"] = "accept"
	codes := run([]map[string]any{review, f.input(1, deliveryHash(sub))}, []string{"reviews", "disputes"}, []int{0, 1})
	if !((codes[0] == 201 && codes[1] == 409) || (codes[0] == 409 && codes[1] == 201)) {
		t.Fatal(codes)
	}
	for _, table := range []string{"delivery_events", "delivery_idempotency"} {
		for _, q := range []string{"UPDATE pactra." + table + " SET actor=actor", "DELETE FROM pactra." + table, "TRUNCATE pactra." + table} {
			if _, err := f.p.Exec(context.Background(), q); err == nil {
				t.Fatal("history writable:", q)
			}
		}
	}
}
func TestDeliveryCheckerRejectionIsActualOutput(t *testing.T) {
	f := deliverySetup(t, true, 0)
	in := f.submitInput(0, "")
	in["artifact"] = map[string]string{}
	sub := f.call(t, "submissions", 1, in, 201)
	persisted := sub["submissions"].([]any)[0].(map[string]any)["checker"].(map[string]any)
	raw, _ := json.Marshal(map[string]any{"source": map[string]string{"repository": "https://example.com/repo"}, "submission": map[string]string{}, "rules": map[string]any{"preserve_placeholders": false, "required_terms": []string{}}})
	w := deliveryRequest(checker.NewHandler(), "POST", "/api/v1/check", "", string(raw))
	var output any
	json.Unmarshal(w.Body.Bytes(), &output)
	if w.Code != 400 || persisted["http_status"] != float64(w.Code) || !reflect.DeepEqual(persisted["output"], output) {
		t.Fatal(persisted, w.Body.String())
	}
}
