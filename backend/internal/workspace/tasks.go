package workspace

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

type Deliverable struct {
	ID                string `json:"id"`
	Title             string `json:"title"`
	Criteria          string `json:"criteria"`
	Amount            string `json:"amount_base_units"`
	RevisionLimit     int    `json:"revision_limit"`
	ReviewPeriodHours int    `json:"review_period_hours"`
}
type TaskInput struct {
	Title            string            `json:"title"`
	Source           map[string]string `json:"source"`
	Worker           string            `json:"worker"`
	PrimaryArbiter   string            `json:"primary_arbiter"`
	BackupArbiter    string            `json:"backup_arbiter"`
	DeliveryDeadline time.Time         `json:"delivery_deadline"`
	Deliverables     []Deliverable     `json:"deliverables"`
}
type Manifest struct {
	Version int    `json:"version"`
	ChainID int64  `json:"chain_id"`
	Buyer   string `json:"buyer"`
	TaskInput
	Total               string    `json:"total_base_units"`
	InviteExpiresAt     time.Time `json:"invite_expires_at"`
	PrimaryArbiterHours int       `json:"primary_arbiter_hours"`
	BackupArbiterHours  int       `json:"backup_arbiter_hours"`
}
type Task struct {
	ID              string          `json:"id"`
	Status          string          `json:"status"`
	Manifest        json.RawMessage `json:"manifest"`
	ManifestHash    string          `json:"manifest_hash"`
	CreatedAt       time.Time       `json:"created_at"`
	InviteExpiresAt time.Time       `json:"invite_expires_at"`
}

var slugRE = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
var decimalRE = regexp.MustCompile(`^[1-9][0-9]{0,77}$`)

func bounded(s string, max int) bool {
	return utf8.ValidString(s) && strings.TrimSpace(s) != "" && utf8.RuneCountInString(s) <= max && !strings.ContainsRune(s, 0)
}
func (s *server) manifest(in TaskInput, buyer string, now time.Time) (Manifest, error) {
	bad := errors.New("invalid task")
	if !bounded(in.Title, 160) || in.Source == nil || len(in.Source) > 100 || len(in.Deliverables) < 1 || len(in.Deliverables) > 10 {
		return Manifest{}, bad
	}
	source, e := json.Marshal(in.Source)
	if e != nil || len(source) > 16<<10 {
		return Manifest{}, bad
	}
	for k, v := range in.Source {
		if !bounded(k, 160) || !utf8.ValidString(v) || strings.ContainsRune(v, 0) {
			return Manifest{}, bad
		}
	}
	parties := map[string]bool{buyer: true}
	for _, p := range []*string{&in.Worker, &in.PrimaryArbiter, &in.BackupArbiter} {
		a, e := address(*p)
		if e != nil || parties[a] {
			return Manifest{}, bad
		}
		*p = a
		parties[a] = true
	}
	if !s.arbiters[in.PrimaryArbiter] || !s.arbiters[in.BackupArbiter] {
		return Manifest{}, bad
	}
	in.DeliveryDeadline = in.DeliveryDeadline.UTC()
	if in.DeliveryDeadline.Before(now.Add(time.Hour)) || in.DeliveryDeadline.After(now.Add(90*24*time.Hour)) {
		return Manifest{}, bad
	}
	total := new(big.Int)
	ids := map[string]bool{}
	for _, d := range in.Deliverables {
		if len(d.ID) > 64 || !slugRE.MatchString(d.ID) || ids[d.ID] || !bounded(d.Title, 160) || !bounded(d.Criteria, 4000) || !decimalRE.MatchString(d.Amount) || d.RevisionLimit < 0 || d.RevisionLimit > 5 || d.ReviewPeriodHours < 24 || d.ReviewPeriodHours > 168 {
			return Manifest{}, bad
		}
		ids[d.ID] = true
		n, ok := new(big.Int).SetString(d.Amount, 10)
		if !ok || n.BitLen() > 256 {
			return Manifest{}, bad
		}
		total.Add(total, n)
		if total.BitLen() > 256 {
			return Manifest{}, bad
		}
	}
	expiry := now.Add(72 * time.Hour)
	if in.DeliveryDeadline.Before(expiry) {
		expiry = in.DeliveryDeadline
	}
	return Manifest{Version: 1, ChainID: s.cfg.ChainID, Buyer: buyer, TaskInput: in, Total: total.String(), InviteExpiresAt: expiry, PrimaryArbiterHours: 48, BackupArbiterHours: 48}, nil
}

// canonicalJSON is application canonical JSON: recursively sorted object keys,
// compact encoding/json representation, normalized addresses/timestamps, integers
// for numeric policy values and decimal strings for amounts. It is not JCS.
func canonicalJSON(v any) ([]byte, error) {
	b, e := json.Marshal(v)
	if e != nil {
		return nil, e
	}
	var obj any
	d := json.NewDecoder(strings.NewReader(string(b)))
	d.UseNumber()
	if e = d.Decode(&obj); e != nil {
		return nil, e
	}
	return json.Marshal(obj)
}

// Idempotency keys accept the UUID text layout (any version), case-insensitively.
// Unlike generated task IDs, keys need not be UUIDv4. Whitespace is not repaired.
var idempotencyUUIDRE = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func taskRequestHash(in TaskInput) ([32]byte, error) {
	// Normalize only request values, never server-generated time/policy fields.
	// Preserve malformed values for hashing too: an existing key with a different
	// decoded payload conflicts; only a new creation runs manifest validation.
	// This deliberately does not enforce the moving delivery deadline window.
	for _, p := range []*string{&in.Worker, &in.PrimaryArbiter, &in.BackupArbiter} {
		if a, e := address(*p); e == nil {
			*p = a
		}
	}
	in.DeliveryDeadline = in.DeliveryDeadline.UTC()
	b, e := canonicalJSON(in)
	return sha256.Sum256(b), e
}

func writeTaskResponse(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}

func (s *server) create(w http.ResponseWriter, r *http.Request, a string) {
	keys, keyed := r.Header[http.CanonicalHeaderKey("Idempotency-Key")]
	key := ""
	if keyed {
		if len(keys) != 1 || !idempotencyUUIDRE.MatchString(keys[0]) {
			fail(w, 400)
			return
		}
		key = strings.ToLower(keys[0])
	}
	var in TaskInput
	if !decode(w, r, &in) {
		return
	}
	var requestHash [32]byte
	var e error
	if keyed {
		requestHash, e = taskRequestHash(in)
		if e != nil {
			fail(w, 400)
			return
		}
	}
	tx, e := s.pool.Begin(r.Context())
	if e != nil {
		fail(w, 503)
		return
	}
	defer tx.Rollback(r.Context())
	if keyed {
		// Serialize across connections/processes until commit, not just in memory.
		// A lock-hash collision only delays unrelated keys; the full PK is checked.
		lockHash := sha256.Sum256([]byte("pactra.task-create\x00" + a + "\x00" + key))
		if _, e = tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock($1)", int64(binary.BigEndian.Uint64(lockHash[:8]))); e != nil {
			fail(w, 503)
			return
		}
		var storedHash, body []byte
		var status int
		e = tx.QueryRow(r.Context(), "SELECT request_hash,response_status,response_body FROM pactra.task_idempotency WHERE buyer=$1 AND key=$2", a, key).Scan(&storedHash, &status, &body)
		if e == nil {
			if !bytes.Equal(storedHash, requestHash[:]) {
				fail(w, 409)
				return
			}
			if tx.Commit(r.Context()) != nil {
				fail(w, 503)
				return
			}
			writeTaskResponse(w, status, body)
			return
		}
		if !errors.Is(e, pgx.ErrNoRows) {
			fail(w, 503)
			return
		}
	}
	// Recovery must precede both current policy and time-dependent validation.
	if len(s.arbiters) == 0 {
		fail(w, 503)
		return
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	m, e := s.manifest(in, a, now)
	if e != nil {
		fail(w, 400)
		return
	}
	b, e := canonicalJSON(m)
	if e != nil {
		fail(w, 400)
		return
	}
	hash := sha256.Sum256(b)
	id, e := uuid()
	if e != nil {
		fail(w, 503)
		return
	}
	for _, p := range []string{m.Worker, m.PrimaryArbiter, m.BackupArbiter} {
		if _, e = tx.Exec(r.Context(), "INSERT INTO pactra.accounts(address) VALUES($1) ON CONFLICT DO NOTHING", p); e != nil {
			fail(w, 503)
			return
		}
	}
	task := Task{ID: id, Status: "invited", Manifest: b, ManifestHash: hex.EncodeToString(hash[:]), CreatedAt: now, InviteExpiresAt: m.InviteExpiresAt}
	_, e = tx.Exec(r.Context(), `INSERT INTO pactra.tasks(id,buyer,worker,primary_arbiter,backup_arbiter,manifest,manifest_json,manifest_hash,created_at,invite_expires_at,delivery_deadline) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, id, a, m.Worker, m.PrimaryArbiter, m.BackupArbiter, string(b), string(b), task.ManifestHash, now, m.InviteExpiresAt, m.DeliveryDeadline)
	if e != nil {
		fail(w, 503)
		return
	}
	body, e := json.Marshal(task)
	if e != nil {
		fail(w, 503)
		return
	}
	body = append(body, '\n') // Preserve the existing Encoder response bytes.
	if keyed {
		_, e = tx.Exec(r.Context(), "INSERT INTO pactra.task_idempotency(buyer,key,request_hash,task_id,response_status,response_body) VALUES($1,$2,$3,$4,$5,$6)", a, key, requestHash[:], id, http.StatusCreated, body)
		if e != nil {
			fail(w, 503)
			return
		}
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	writeTaskResponse(w, http.StatusCreated, body)
}

const taskColumns = "id::text,status,manifest_json,manifest_hash,created_at,invite_expires_at"
const participant = "($2=buyer OR $2=worker)"

func scanTask(row pgx.Row) (Task, error) {
	var t Task
	var b string
	e := row.Scan(&t.ID, &t.Status, &b, &t.ManifestHash, &t.CreatedAt, &t.InviteExpiresAt)
	t.Manifest = json.RawMessage(b)
	return t, e
}
func (s *server) get(w http.ResponseWriter, r *http.Request, a string) {
	id := r.PathValue("id")
	if !uuidRE.MatchString(id) {
		fail(w, 404)
		return
	}
	t, e := scanTask(s.pool.QueryRow(r.Context(), "SELECT "+taskColumns+" FROM pactra.tasks WHERE id=$1 AND "+participant, id, a))
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404)
		return
	}
	if e != nil {
		fail(w, 503)
		return
	}
	respond(w, 200, t)
}
func taskCursor(t Task) string {
	return base64.RawURLEncoding.EncodeToString([]byte("1\n" + t.CreatedAt.UTC().Format(time.RFC3339Nano) + "\n" + t.ID))
}

func parseTaskPage(r *http.Request) (int, *Task, error) {
	bad := errors.New("invalid task pagination")
	q, e := url.ParseQuery(r.URL.RawQuery)
	if e != nil {
		return 0, nil, bad
	}
	limit := 50
	if values, ok := q["limit"]; ok {
		if len(values) != 1 {
			return 0, nil, bad
		}
		limit, e = strconv.Atoi(values[0])
		if e != nil || limit < 1 || limit > 50 || strconv.Itoa(limit) != values[0] {
			return 0, nil, bad
		}
	}
	var after *Task
	if values, ok := q["cursor"]; ok {
		if len(values) != 1 || len(values[0]) == 0 || len(values[0]) > 128 {
			return 0, nil, bad
		}
		b, e := base64.RawURLEncoding.Strict().DecodeString(values[0])
		parts := strings.Split(string(b), "\n")
		if e != nil || len(parts) != 3 || parts[0] != "1" || !uuidRE.MatchString(parts[2]) {
			return 0, nil, bad
		}
		stamp, e := time.Parse(time.RFC3339Nano, parts[1])
		if e != nil || stamp.Year() < 1 || stamp.Nanosecond()%1000 != 0 {
			return 0, nil, bad
		}
		after = &Task{ID: parts[2], CreatedAt: stamp}
		if taskCursor(*after) != values[0] {
			return 0, nil, bad
		}
	}
	return limit, after, nil
}

func (s *server) list(w http.ResponseWriter, r *http.Request, a string) {
	limit, after, e := parseTaskPage(r)
	if e != nil {
		fail(w, 400)
		return
	}
	query := "SELECT " + taskColumns + " FROM pactra.tasks WHERE (buyer=$1 OR worker=$1)"
	args := []any{a, limit + 1}
	if after != nil {
		query += " AND (created_at,id)<($3::timestamptz,$4::uuid)"
		args = append(args, after.CreatedAt, after.ID)
	}
	query += " ORDER BY created_at DESC,id DESC LIMIT $2"
	rows, e := s.pool.Query(r.Context(), query, args...)
	if e != nil {
		fail(w, 503)
		return
	}
	defer rows.Close()
	tasks := []Task{}
	for rows.Next() {
		t, e := scanTask(rows)
		if e != nil {
			fail(w, 503)
			return
		}
		tasks = append(tasks, t)
	}
	if rows.Err() != nil {
		fail(w, 503)
		return
	}
	var next *string
	if len(tasks) > limit {
		tasks = tasks[:limit]
		cursor := taskCursor(tasks[len(tasks)-1])
		next = &cursor
	}
	respond(w, 200, map[string]any{"tasks": tasks, "next_cursor": next})
}
func (s *server) accept(w http.ResponseWriter, r *http.Request, a string) {
	var in struct {
		Hash string `json:"manifest_hash"`
	}
	if !decode(w, r, &in) {
		return
	}
	s.transition(w, r, a, true, in.Hash)
}
func (s *server) cancel(w http.ResponseWriter, r *http.Request, a string) {
	var in struct{}
	if !decode(w, r, &in) {
		return
	}
	s.transition(w, r, a, false, "")
}
func (s *server) transition(w http.ResponseWriter, r *http.Request, a string, accept bool, hash string) {
	id := r.PathValue("id")
	if !uuidRE.MatchString(id) {
		fail(w, 404)
		return
	}
	tx, e := s.pool.Begin(r.Context())
	if e != nil {
		fail(w, 503)
		return
	}
	defer tx.Rollback(r.Context())
	var buyer, worker, status, stored string
	var unexpired bool
	e = tx.QueryRow(r.Context(), "SELECT buyer,worker,status,manifest_hash,invite_expires_at>clock_timestamp() FROM pactra.tasks WHERE id=$1 AND "+participant+" FOR UPDATE", id, a).Scan(&buyer, &worker, &status, &stored, &unexpired)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404)
		return
	}
	if e != nil {
		fail(w, 503)
		return
	}
	if (accept && a != worker) || (!accept && a != buyer) {
		fail(w, 403)
		return
	}
	if status != "invited" || (accept && (!unexpired || hash != stored)) {
		fail(w, 409)
		return
	}
	target := "cancelled"
	if accept {
		target = "accepted_unfunded"
	}
	query := "UPDATE pactra.tasks SET status=$2 WHERE id=$1 AND status='invited'"
	if accept {
		query += " AND invite_expires_at>clock_timestamp()"
	}
	result, e := tx.Exec(r.Context(), query, id, target)
	if e != nil {
		fail(w, 503)
		return
	}
	if result.RowsAffected() != 1 {
		fail(w, 409)
		return
	}
	t, e := scanTask(tx.QueryRow(r.Context(), "SELECT "+taskColumns+" FROM pactra.tasks WHERE id=$1", id))
	if e != nil {
		fail(w, 503)
		return
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	respond(w, 200, t)
}
