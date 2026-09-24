package workspace

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func reliabilitySetup(t *testing.T) (*pgxpool.Pool, http.Handler, []*ecdsa.PrivateKey) {
	t.Helper()
	p, h, ks := setup(t)
	sql, err := os.ReadFile("../../migrations/0002_task_reliability.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = p.Exec(context.Background(), string(sql)); err != nil {
		t.Fatal(err)
	}
	return p, h, ks
}

func reliabilityCreate(h http.Handler, token string, body []byte, keys ...string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+token)
	for _, k := range keys {
		r.Header.Add("Idempotency-Key", k)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}
func reliabilityBody(t *testing.T, v any) []byte {
	t.Helper()
	b, e := json.Marshal(v)
	if e != nil {
		t.Fatal(e)
	}
	return b
}

const reliabilityKey = "bdec5a01-c9dc-4b63-82ab-f3de0a8cb101"

func TestIdempotencyConcurrentCanonicalAndBuyerScope(t *testing.T) {
	p, h, ks := reliabilitySetup(t)
	token := login(t, h, ks[0])
	in := terms(ks)
	body := reliabilityBody(t, in)
	// Independent pools/handlers must coordinate through PostgreSQL, not memory.
	otherPool, err := pgxpool.New(context.Background(), os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(otherPool.Close)
	otherHandler, err := New(otherPool, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1, Arbiters: []string{addr(ks[2]), addr(ks[3])}})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	start := make(chan struct{})
	replies := make(chan *httptest.ResponseRecorder, 16)
	for i := 0; i < 16; i++ {
		wg.Add(1)
		handler := h
		if i%2 == 1 {
			handler = otherHandler
		}
		go func() { defer wg.Done(); <-start; replies <- reliabilityCreate(handler, token, body, reliabilityKey) }()
	}
	close(start)
	wg.Wait()
	close(replies)
	var original string
	for w := range replies {
		expect(t, 201, w.Code, w.Body.String())
		if original == "" {
			original = w.Body.String()
		}
		if original != w.Body.String() {
			t.Fatal("concurrent retry changed original response")
		}
	}
	var n int
	if e := p.QueryRow(context.Background(), "SELECT count(*) FROM pactra.tasks").Scan(&n); e != nil || n != 1 {
		t.Fatalf("task count %d: %v", n, e)
	}
	var stored []byte
	if e := p.QueryRow(context.Background(), "SELECT response_body FROM pactra.task_idempotency WHERE buyer=$1 AND key=$2", addr(ks[0]), reliabilityKey).Scan(&stored); e != nil || string(stored) != original {
		t.Fatalf("durable response mismatch: %v", e)
	}
	// Object formatting, address case and equivalent timestamp offsets are canonical.
	in["worker"] = "0x" + strings.ToUpper(addr(ks[1])[2:])
	deadline, e := time.Parse(time.RFC3339, in["delivery_deadline"].(string))
	if e != nil {
		t.Fatal(e)
	}
	in["delivery_deadline"] = deadline.In(time.FixedZone("offset", 3600)).Format(time.RFC3339)
	pretty, e := json.MarshalIndent(in, "", "  ")
	if e != nil {
		t.Fatal(e)
	}
	w := reliabilityCreate(h, token, pretty, strings.ToUpper(reliabilityKey))
	expect(t, 201, w.Code, w.Body.String())
	if w.Body.String() != original {
		t.Fatal("canonical retry differs")
	}
	in["title"] = "Different request"
	w = reliabilityCreate(h, token, reliabilityBody(t, in), reliabilityKey)
	expect(t, 409, w.Code, w.Body.String())
	// The same key is independent for another authenticated buyer.
	other := login(t, h, ks[4])
	w = reliabilityCreate(h, other, body, reliabilityKey)
	expect(t, 201, w.Code, w.Body.String())
	if w.Body.String() == original {
		t.Fatal("cross-buyer replay")
	}
	for i := 0; i < 2; i++ {
		w = reliabilityCreate(h, token, body)
		expect(t, 201, w.Code, w.Body.String())
	}
	if e := p.QueryRow(context.Background(), "SELECT count(*) FROM pactra.tasks").Scan(&n); e != nil || n != 4 {
		t.Fatalf("backcompat count %d: %v", n, e)
	}
}

type lostReliabilityResponse struct {
	header http.Header
	status int
}

func (w *lostReliabilityResponse) Header() http.Header    { return w.header }
func (w *lostReliabilityResponse) WriteHeader(status int) { w.status = status }
func (w *lostReliabilityResponse) Write([]byte) (int, error) {
	return 0, errors.New("client disconnected")
}

func TestIdempotencyLostResponseTimeValidationAndAcceptedSnapshot(t *testing.T) {
	p, h, ks := reliabilitySetup(t)
	token := login(t, h, ks[0])
	worker := login(t, h, ks[1])
	in := terms(ks)
	// Exercise the real clock: soon the original deadline fails the one-hour minimum.
	deadline := time.Now().UTC().Add(time.Hour + time.Second)
	in["delivery_deadline"] = deadline.Format(time.RFC3339Nano)
	body := reliabilityBody(t, in)
	r := httptest.NewRequest("POST", "/api/v1/tasks", bytes.NewReader(body))
	r.Header.Set("Authorization", "Bearer "+token)
	r.Header.Set("Idempotency-Key", reliabilityKey)
	lost := &lostReliabilityResponse{header: make(http.Header)}
	h.ServeHTTP(lost, r)
	expect(t, 201, lost.status, "lost response")
	var original []byte
	if e := p.QueryRow(context.Background(), "SELECT response_body FROM pactra.task_idempotency WHERE buyer=$1 AND key=$2", addr(ks[0]), reliabilityKey).Scan(&original); e != nil {
		t.Fatal(e)
	}
	var task Task
	if e := json.Unmarshal(original, &task); e != nil {
		t.Fatal(e)
	}
	code, v := call(t, h, "POST", "/api/v1/tasks/"+task.ID+"/accept", worker, map[string]string{"manifest_hash": task.ManifestHash})
	expect(t, 200, code, v)
	time.Sleep(time.Until(deadline.Add(-time.Hour)) + 20*time.Millisecond)
	w := reliabilityCreate(h, token, body)
	expect(t, 400, w.Code, w.Body.String())
	// Fresh server, no arbiter configuration: durable recovery precedes validation.
	fresh, e := New(p, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1})
	if e != nil {
		t.Fatal(e)
	}
	w = reliabilityCreate(fresh, token, body, reliabilityKey)
	expect(t, 201, w.Code, w.Body.String())
	if !bytes.Equal(original, w.Body.Bytes()) {
		t.Fatal("replay lost original response")
	}
	in["title"] = "Changed after time validation expired"
	w = reliabilityCreate(fresh, token, reliabilityBody(t, in), reliabilityKey)
	expect(t, 409, w.Code, w.Body.String())
	in["worker"] = "malformed address"
	w = reliabilityCreate(fresh, token, reliabilityBody(t, in), reliabilityKey)
	expect(t, 409, w.Code, w.Body.String())
	code, v = call(t, h, "GET", "/api/v1/tasks/"+task.ID, worker, nil)
	expect(t, 200, code, v)
	if v["status"] != "accepted_unfunded" {
		t.Fatal(v)
	}
	if _, e = p.Exec(context.Background(), "UPDATE pactra.tasks SET status='cancelled' WHERE id=$1", task.ID); e == nil {
		t.Fatal("accepted task mutable")
	}
}

func TestIdempotencyRejectMalformedAndRollback(t *testing.T) {
	p, h, ks := reliabilitySetup(t)
	token := login(t, h, ks[0])
	in := terms(ks)
	body := reliabilityBody(t, in)
	for _, keys := range [][]string{{""}, {"bad"}, {" " + reliabilityKey}, {reliabilityKey + " "}, {"{" + reliabilityKey + "}"}, {reliabilityKey, reliabilityKey}, {reliabilityKey + "," + reliabilityKey}} {
		w := reliabilityCreate(h, token, body, keys...)
		expect(t, 400, w.Code, w.Body.String())
	}
	in["title"] = ""
	w := reliabilityCreate(h, token, reliabilityBody(t, in), reliabilityKey)
	expect(t, 400, w.Code, w.Body.String())
	var n int
	if e := p.QueryRow(context.Background(), "SELECT count(*) FROM pactra.task_idempotency").Scan(&n); e != nil || n != 0 {
		t.Fatalf("invalid request reserved key: %d %v", n, e)
	}
	// Inject a DB failure after the task INSERT, to prove both writes roll back.
	_, e := p.Exec(context.Background(), `CREATE FUNCTION pactra.fail_reliability_record() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test insertion failure'; END $$; CREATE TRIGGER reliability_failure BEFORE INSERT ON pactra.task_idempotency FOR EACH ROW EXECUTE FUNCTION pactra.fail_reliability_record()`)
	if e != nil {
		t.Fatal(e)
	}
	w = reliabilityCreate(h, token, body, reliabilityKey)
	expect(t, 503, w.Code, w.Body.String())
	if e = p.QueryRow(context.Background(), "SELECT count(*) FROM pactra.tasks").Scan(&n); e != nil || n != 0 {
		t.Fatalf("orphan task: %d %v", n, e)
	}
	if _, e = p.Exec(context.Background(), "DROP TRIGGER reliability_failure ON pactra.task_idempotency"); e != nil {
		t.Fatal(e)
	}
	w = reliabilityCreate(h, token, body, reliabilityKey)
	expect(t, 201, w.Code, w.Body.String())
}

func TestIdempotencyConcurrentDifferentPayload(t *testing.T) {
	p, h, ks := reliabilitySetup(t)
	token := login(t, h, ks[0])
	in := terms(ks)
	first := reliabilityBody(t, in)
	in["title"] = "Second payload"
	second := reliabilityBody(t, in)
	start := make(chan struct{})
	replies := make(chan *httptest.ResponseRecorder, 2)
	for _, b := range [][]byte{first, second} {
		go func(b []byte) { <-start; replies <- reliabilityCreate(h, token, b, reliabilityKey) }(b)
	}
	close(start)
	counts := map[int]int{}
	for i := 0; i < 2; i++ {
		w := <-replies
		counts[w.Code]++
	}
	if counts[201] != 1 || counts[409] != 1 {
		t.Fatal(counts)
	}
	var n int
	if e := p.QueryRow(context.Background(), "SELECT count(*) FROM pactra.tasks").Scan(&n); e != nil || n != 1 {
		t.Fatalf("tasks %d %v", n, e)
	}
}
