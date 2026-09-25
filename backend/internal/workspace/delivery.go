package workspace

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	checker "pactra/backend"
)

var deliveryHashRE = regexp.MustCompile(`^[0-9a-f]{64}$`)

// Deliberately no exported funding, adjudication, AI or timer configuration.
// The existing checker is invoked in-process with its external AI disabled.
var deliveryChecker = checker.NewHandler()

type deliveryInput struct {
	IdempotencyKey  string          `json:"idempotency_key"`
	UnfundedReview  bool            `json:"unfunded_review"`
	ManifestHash    string          `json:"manifest_hash"`
	ExpectedVersion int             `json:"expected_version"`
	ArtifactHash    string          `json:"artifact_hash"`
	Notes           string          `json:"notes"`
	Artifact        json.RawMessage `json:"artifact,omitempty"`
	Decision        string          `json:"decision,omitempty"`
}

type deliverySnapshot struct {
	TaskID             string            `json:"task_id"`
	DeliverableID      string            `json:"deliverable_id"`
	TaskStatus         string            `json:"task_status"`
	UnfundedReview     bool              `json:"unfunded_review"`
	ManifestHash       string            `json:"manifest_hash"`
	State              string            `json:"state"`
	LatestVersion      int               `json:"latest_version"`
	LatestArtifactHash string            `json:"latest_artifact_hash"`
	RevisionLimit      int               `json:"revision_limit"`
	Submissions        []json.RawMessage `json:"submissions"`
	Reviews            []json.RawMessage `json:"reviews"`
	Disputes           []json.RawMessage `json:"disputes"`
}

type deliveryRules struct {
	PreservePlaceholders bool     `json:"preserve_placeholders"`
	RequiredTerms        []string `json:"required_terms"`
}
type deliveryCheck struct {
	Policy     string          `json:"policy"`
	Rules      deliveryRules   `json:"rules"`
	HTTPStatus int             `json:"http_status"`
	Output     json.RawMessage `json:"output"`
}
type deliveryEvent struct {
	Version       int                `json:"version"`
	Actor         string             `json:"actor"`
	ArtifactHash  string             `json:"artifact_hash"`
	ManifestHash  string             `json:"manifest_hash"`
	Notes         string             `json:"notes"`
	CreatedAt     time.Time          `json:"created_at"`
	Artifact      json.RawMessage    `json:"artifact,omitempty"`
	Checker       *deliveryCheck     `json:"checker,omitempty"`
	Decision      string             `json:"decision,omitempty"`
	EvidenceFlag  bool               `json:"evidence_flag,omitempty"`
	ChainRevision *chainRevisionLink `json:"chain_revision,omitempty"`
}

func (s *server) registerDelivery(mux *http.ServeMux) {
	for _, op := range []string{"submissions", "reviews", "disputes"} {
		mux.HandleFunc("POST /api/v1/tasks/{id}/deliverables/{deliverable}/"+op, s.deliveryRoute(op, false))
	}
	mux.HandleFunc("GET /api/v1/tasks/{id}/deliverables/{deliverable}/submissions", s.deliveryRoute("submissions", true))
}
func (s *server) deliveryRoute(operation string, read bool) http.HandlerFunc {
	authenticated := s.auth(func(w http.ResponseWriter, r *http.Request, actor string) { s.delivery(w, r, actor, operation, read) })
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		timeout := 5 * time.Second
		if s.cfg.Onchain != nil {
			timeout = 35 * time.Second
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		authenticated(w, r.WithContext(ctx))
	}
}

// Parse strict raw JSON before the standard decoder can erase duplicates,
// malformed Unicode or the byte length of the submitted artifact.
func deliveryDecode(w http.ResponseWriter, r *http.Request, operation string) (deliveryInput, bool) {
	var in deliveryInput
	media, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		fail(w, 415)
		return in, false
	}
	b, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		var large *http.MaxBytesError
		if errors.As(err, &large) {
			fail(w, 413)
		} else {
			fail(w, 400)
		}
		return in, false
	}
	invalid := func() (deliveryInput, bool) { fail(w, 400); return deliveryInput{}, false }
	if !validJSONUnicode(b) {
		return invalid()
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	if strictValue(d, 0, nil) != nil {
		return invalid()
	}
	if _, err = d.Token(); err != io.EOF {
		return invalid()
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(b, &fields) != nil || fields == nil {
		return invalid()
	}
	required := []string{"idempotency_key", "unfunded_review", "manifest_hash", "expected_version", "artifact_hash"}
	allowed := map[string]bool{"notes": true}
	if operation == "submissions" {
		required = append(required, "artifact")
	}
	if operation == "reviews" {
		required = append(required, "decision")
	}
	for _, key := range required {
		allowed[key] = true
		if _, ok := fields[key]; !ok {
			return invalid()
		}
	}
	for key := range fields {
		if !allowed[key] {
			return invalid()
		}
	}
	if json.Unmarshal(b, &in) != nil || !in.UnfundedReview || !uuidRE.MatchString(in.IdempotencyKey) || !deliveryHashRE.MatchString(in.ManifestHash) || in.ExpectedVersion < 0 || in.ExpectedVersion > 6 ||
		(in.ArtifactHash != "" && !deliveryHashRE.MatchString(in.ArtifactHash)) || utf8.RuneCountInString(in.Notes) > 2000 || strings.ContainsRune(in.Notes, 0) {
		return invalid()
	}
	if operation == "reviews" && in.Decision != "accept" && in.Decision != "request_revision" {
		return invalid()
	}
	if operation == "submissions" {
		if len(in.Artifact) > 16<<10 {
			return invalid()
		}
		var artifact map[string]string
		if json.Unmarshal(in.Artifact, &artifact) != nil || artifact == nil || len(artifact) > 100 {
			return invalid()
		}
		for k, v := range artifact {
			if !bounded(k, 160) || strings.ContainsRune(v, 0) {
				return invalid()
			}
		}
		in.Artifact, err = canonicalJSON(artifact)
		if err != nil {
			return invalid()
		}
	}
	return in, true
}

func deliveryRunChecker(ctx context.Context, source map[string]string, artifact json.RawMessage) (*deliveryCheck, error) {
	rules := deliveryRules{RequiredTerms: []string{}}
	b, err := json.Marshal(struct {
		Source     map[string]string `json:"source"`
		Submission json.RawMessage   `json:"submission"`
		Rules      deliveryRules     `json:"rules"`
	}{source, artifact, rules})
	if err != nil {
		return nil, err
	}
	r, err := http.NewRequestWithContext(ctx, "POST", "/api/v1/check", bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	deliveryChecker.ServeHTTP(w, r)
	// Preserve even real checker input errors; never turn them into a pass or
	// invent a checker result. Unexpected internal failure aborts the transaction.
	if w.Code >= 500 || !json.Valid(w.Body.Bytes()) {
		return nil, errors.New("checker unavailable")
	}
	return &deliveryCheck{Policy: "default_metadata_only", Rules: rules, HTTPStatus: w.Code, Output: json.RawMessage(bytes.TrimSpace(w.Body.Bytes()))}, nil
}

func deliveryLoad(ctx context.Context, tx pgx.Tx, snapshot *deliverySnapshot) error {
	rows, err := tx.Query(ctx, `SELECT kind,event_json FROM pactra.delivery_events WHERE task_id=$1 AND deliverable_id=$2 ORDER BY version,CASE kind WHEN 'submission' THEN 0 WHEN 'review' THEN 1 ELSE 2 END`, snapshot.TaskID, snapshot.DeliverableID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var kind, raw string
		if err = rows.Scan(&kind, &raw); err != nil {
			return err
		}
		var event deliveryEvent
		if err = json.Unmarshal([]byte(raw), &event); err != nil {
			return err
		}
		switch kind {
		case "submission":
			snapshot.Submissions = append(snapshot.Submissions, json.RawMessage(raw))
			snapshot.LatestVersion = event.Version
			snapshot.LatestArtifactHash = event.ArtifactHash
			snapshot.State = "submitted"
		case "review":
			snapshot.Reviews = append(snapshot.Reviews, json.RawMessage(raw))
			snapshot.State = "accepted"
			if event.Decision == "request_revision" {
				snapshot.State = "revision_requested"
			}
		case "dispute":
			snapshot.Disputes = append(snapshot.Disputes, json.RawMessage(raw))
			snapshot.State = "disputed"
		}
	}
	return rows.Err()
}

func (s *server) delivery(w http.ResponseWriter, r *http.Request, actor, operation string, read bool) {
	id, deliverable := r.PathValue("id"), r.PathValue("deliverable")
	if !uuidRE.MatchString(id) || len(deliverable) > 64 || !slugRE.MatchString(deliverable) {
		fail(w, 404)
		return
	}
	var in deliveryInput
	if !read {
		var ok bool
		in, ok = deliveryDecode(w, r, operation)
		if !ok {
			return
		}
	}
	ctx := r.Context()
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		fail(w, 503)
		return
	}
	defer tx.Rollback(ctx)
	var buyer, worker, status, manifestHash, manifestJSON string
	// This always-existing parent row serializes initial submissions too. Readers
	// take the same lock so the entire history snapshot is atomic across processes.
	err = tx.QueryRow(ctx, `SELECT buyer,worker,status,manifest_hash,manifest_json FROM pactra.tasks WHERE id=$1 AND ($2=buyer OR $2=worker) FOR UPDATE`, id, actor).Scan(&buyer, &worker, &status, &manifestHash, &manifestJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		fail(w, 404)
		return
	}
	if err != nil {
		fail(w, 503)
		return
	}
	var manifest Manifest
	if json.Unmarshal([]byte(manifestJSON), &manifest) != nil {
		fail(w, 503)
		return
	}
	limit := -1
	for _, d := range manifest.Deliverables {
		if d.ID == deliverable {
			limit = d.RevisionLimit
			break
		}
	}
	if limit < 0 {
		fail(w, 404)
		return
	}
	if status != "accepted_unfunded" {
		fail(w, 409)
		return
	}
	if !read && ((operation == "submissions" && actor != worker) || (operation == "reviews" && actor != buyer)) {
		fail(w, 403)
		return
	}
	var canonical []byte
	if !read {
		canonical, err = canonicalJSON(in)
		if err != nil {
			fail(w, 400)
			return
		}
		var stored, response string
		err = tx.QueryRow(ctx, `SELECT canonical_payload,response_json FROM pactra.delivery_idempotency WHERE task_id=$1 AND deliverable_id=$2 AND operation=$3 AND actor=$4 AND idempotency_key=$5`, id, deliverable, operation, actor, in.IdempotencyKey).Scan(&stored, &response)
		if err == nil {
			if stored != string(canonical) {
				fail(w, 409)
				return
			}
			if tx.Commit(ctx) != nil {
				fail(w, 503)
				return
			}
			respond(w, 201, json.RawMessage(response))
			return
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			fail(w, 503)
			return
		}
	}
	snapshot := deliverySnapshot{TaskID: id, DeliverableID: deliverable, TaskStatus: status, UnfundedReview: true, ManifestHash: manifestHash, State: "not_submitted", RevisionLimit: limit, Submissions: []json.RawMessage{}, Reviews: []json.RawMessage{}, Disputes: []json.RawMessage{}}
	if deliveryLoad(ctx, tx, &snapshot) != nil {
		fail(w, 503)
		return
	}
	if read {
		if tx.Commit(ctx) != nil {
			fail(w, 503)
			return
		}
		respond(w, 200, snapshot)
		return
	}
	if in.ManifestHash != manifestHash || in.ExpectedVersion != snapshot.LatestVersion || in.ArtifactHash != snapshot.LatestArtifactHash || snapshot.State == "accepted" || snapshot.State == "disputed" {
		fail(w, 409)
		return
	}
	event := deliveryEvent{Version: snapshot.LatestVersion, Actor: actor, ArtifactHash: snapshot.LatestArtifactHash, ManifestHash: manifestHash, Notes: in.Notes}
	if tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&event.CreatedAt) != nil {
		fail(w, 503)
		return
	}
	event.CreatedAt = event.CreatedAt.UTC()
	chainNext := false
	if operation == "submissions" && s.cfg.Onchain != nil {
		life, e := s.boundLifecycle(ctx, tx, id, manifestJSON, manifestHash)
		if e != nil {
			fail(w, 503)
			return
		}
		if life != nil {
			for _, d := range life.Allocations {
				if d.DeliverableID == deliverable {
					chainNext = d.NextLocalSubmission
				}
			}
			if !chainNext {
				fail(w, 409)
				return
			}
			event.ChainRevision = &chainRevisionLink{BlockNumber: life.BlockNumber, BlockHash: life.BlockHash, Round: snapshot.LatestVersion + 1}
			if s.cfg.Onchain.checkObservation(ctx, life) != nil {
				fail(w, 503)
				return
			}
		}
	}
	kind := ""
	switch operation {
	case "submissions":
		if !chainNext && snapshot.State != "not_submitted" && (snapshot.State != "revision_requested" || snapshot.LatestVersion > limit) {
			fail(w, 409)
			return
		}
		event.Version++
		event.Artifact = in.Artifact
		digest := sha256.Sum256(in.Artifact)
		event.ArtifactHash = hex.EncodeToString(digest[:])
		event.Checker, err = deliveryRunChecker(ctx, manifest.Source, in.Artifact)
		if err != nil {
			fail(w, 503)
			return
		}
		snapshot.State = "submitted"
		snapshot.LatestVersion = event.Version
		snapshot.LatestArtifactHash = event.ArtifactHash
		kind = "submission"
	case "reviews":
		if snapshot.State != "submitted" || (in.Decision == "request_revision" && snapshot.LatestVersion > limit) {
			fail(w, 409)
			return
		}
		event.Decision = in.Decision
		snapshot.State = "accepted"
		if in.Decision == "request_revision" {
			snapshot.State = "revision_requested"
		}
		kind = "review"
	case "disputes":
		if snapshot.State != "submitted" && snapshot.State != "revision_requested" {
			fail(w, 409)
			return
		}
		event.EvidenceFlag = true
		snapshot.State = "disputed"
		kind = "dispute"
	}
	raw, err := json.Marshal(event)
	if err != nil {
		fail(w, 503)
		return
	}
	switch kind {
	case "submission":
		snapshot.Submissions = append(snapshot.Submissions, raw)
	case "review":
		snapshot.Reviews = append(snapshot.Reviews, raw)
	case "dispute":
		snapshot.Disputes = append(snapshot.Disputes, raw)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO pactra.delivery_events(task_id,deliverable_id,kind,version,actor,artifact_hash,manifest_hash,event_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, id, deliverable, kind, event.Version, actor, event.ArtifactHash, manifestHash, string(raw)); err != nil {
		fail(w, 503)
		return
	}
	response, err := json.Marshal(snapshot)
	if err != nil {
		fail(w, 503)
		return
	}
	if _, err = tx.Exec(ctx, `INSERT INTO pactra.delivery_idempotency(task_id,deliverable_id,operation,actor,idempotency_key,canonical_payload,response_json) VALUES($1,$2,$3,$4,$5,$6,$7)`, id, deliverable, operation, actor, in.IdempotencyKey, string(canonical), string(response)); err != nil {
		fail(w, 503)
		return
	}
	if tx.Commit(ctx) != nil {
		fail(w, 503)
		return
	}
	respond(w, 201, json.RawMessage(response))
}
