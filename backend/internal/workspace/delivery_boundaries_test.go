package workspace

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestDeliveryExactBoundsAndStaleFingerprints(t *testing.T) {
	f := deliverySetup(t, true, 5)
	in := f.submitInput(0, "")
	// Raw object is exactly 16384 bytes. Its long value causes the real checker's
	// stricter per-value validation to reject it; the artifact itself is valid.
	in["artifact"] = json.RawMessage(`{"a":"` + strings.Repeat("x", (16<<10)-8) + `"}`)
	in["notes"] = strings.Repeat("界", 2000)
	first := f.call(t, "submissions", 1, in, 201)
	entry := first["submissions"].([]any)[0].(map[string]any)
	if len(entry["artifact"].(map[string]any)["a"].(string)) != (16<<10)-8 || entry["notes"] != in["notes"] {
		t.Fatal("boundary truncated")
	}
	hash := deliveryHash(first)
	for _, change := range []map[string]any{{"manifest_hash": strings.Repeat("0", 64)}, {"artifact_hash": strings.Repeat("0", 64)}, {"expected_version": 0}} {
		review := f.input(1, hash)
		review["decision"] = "accept"
		for k, v := range change {
			review[k] = v
		}
		f.call(t, "reviews", 0, review, 409)
		dispute := f.input(1, hash)
		for k, v := range change {
			dispute[k] = v
		}
		f.call(t, "disputes", 1, dispute, 409)
	}
	// Exercise every agreed revision, including the maximum supported limit.
	for version := 1; version <= 5; version++ {
		review := f.input(version, hash)
		review["decision"] = "request_revision"
		f.call(t, "reviews", 0, review, 201)
		revision := f.submitInput(version, hash)
		artifact := map[string]string{}
		for i := 0; i < 100; i++ {
			artifact[fmt.Sprint(i)] = fmt.Sprint(version)
		}
		revision["artifact"] = artifact
		next := f.call(t, "submissions", 1, revision, 201)
		deliveryState(t, next, "submitted", version+1)
		hash = deliveryHash(next)
	}
	exhausted := f.input(6, hash)
	exhausted["decision"] = "request_revision"
	f.call(t, "reviews", 0, exhausted, 409)
	exhausted["decision"] = "accept"
	f.call(t, "reviews", 0, exhausted, 201)
}

func TestDeliveryIdempotencyScopeAndConcurrentRevision(t *testing.T) {
	f := deliverySetup(t, true, 2)
	firstInput := f.submitInput(0, "")
	first := f.call(t, "submissions", 1, firstInput, 201)
	hash := deliveryHash(first)
	review := f.input(1, hash)
	review["decision"] = "request_revision"
	// A key is not global: another operation/actor is independent.
	review["idempotency_key"] = firstInput["idempotency_key"]
	requested := f.call(t, "reviews", 0, review, 201)
	if !reflect.DeepEqual(requested, f.call(t, "reviews", 0, review, 201)) {
		t.Fatal("review replay changed")
	}
	review["decision"] = "accept"
	f.call(t, "reviews", 0, review, 409)
	// Independent server instances share the database row lock, not a Go mutex.
	s := &server{pool: f.p, cfg: Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1}}
	mux := http.NewServeMux()
	s.registerDelivery(mux)
	handlers := []http.Handler{f.h, mux}
	var wg sync.WaitGroup
	start := make(chan struct{})
	codes := make([]int, 2)
	for i := range handlers {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			in := f.submitInput(1, hash)
			in["artifact"] = map[string]string{"repository": fmt.Sprint(i)}
			raw, _ := json.Marshal(in)
			<-start
			codes[i] = deliveryRequest(handlers[i], "POST", f.base+"/submissions", f.tokens[1], string(raw)).Code
		}(i)
	}
	close(start)
	wg.Wait()
	if !((codes[0] == 201 && codes[1] == 409) || (codes[0] == 409 && codes[1] == 201)) {
		t.Fatal(codes)
	}
	got := f.call(t, "submissions", 0, nil, 200)
	deliveryState(t, got, "submitted", 2)
	if len(got["submissions"].([]any)) != 2 {
		t.Fatal(got)
	}
	var events, keys int
	if err := f.p.QueryRow(context.Background(), "SELECT (SELECT count(*) FROM pactra.delivery_events),(SELECT count(*) FROM pactra.delivery_idempotency)").Scan(&events, &keys); err != nil || events != 3 || keys != 3 {
		t.Fatal(events, keys, err)
	}
}

func TestDeliveryAtomicRollbackAndRetry(t *testing.T) {
	f := deliverySetup(t, true, 2)
	// A real DB failure after event insertion must roll the event back too.
	if _, err := f.p.Exec(context.Background(), `ALTER TABLE pactra.delivery_idempotency ADD CONSTRAINT delivery_test_reject CHECK (false) NOT VALID`); err != nil {
		t.Fatal(err)
	}
	in := f.submitInput(0, "")
	f.call(t, "submissions", 1, in, 503)
	empty := f.call(t, "submissions", 0, nil, 200)
	deliveryState(t, empty, "not_submitted", 0)
	var count int
	if err := f.p.QueryRow(context.Background(), "SELECT count(*) FROM pactra.delivery_events").Scan(&count); err != nil || count != 0 {
		t.Fatal(count, err)
	}
	if _, err := f.p.Exec(context.Background(), `ALTER TABLE pactra.delivery_idempotency DROP CONSTRAINT delivery_test_reject`); err != nil {
		t.Fatal(err)
	}
	deliveryState(t, f.call(t, "submissions", 1, in, 201), "submitted", 1)
}
