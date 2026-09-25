package workspace

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *server) registerArbiter(m *http.ServeMux) {
	m.HandleFunc("GET /api/v1/arbiter/disputes", s.auth(s.arbiterQueue))
	m.HandleFunc("GET /api/v1/arbiter/tasks/{id}/deliverables/{deliverable}/evidence", s.auth(s.arbiterEvidence))
}

type disputeSummary struct {
	EvidenceSource string             `json:"evidence_source,omitempty"`
	Onchain        *lifecycleSnapshot `json:"onchain,omitempty"`
	TaskID         string             `json:"task_id"`
	DeliverableID  string             `json:"deliverable_id"`
	ManifestHash   string             `json:"manifest_hash"`
	Version        int                `json:"version"`
	ArtifactHash   string             `json:"artifact_hash"`
	CreatedAt      time.Time          `json:"created_at"`
}

func (s *server) arbiterQueue(w http.ResponseWriter, r *http.Request, a string) {
	q, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		fail(w, 400)
		return
	}
	limit := 50
	afterID, afterD := "", ""
	for k, v := range q {
		if len(v) != 1 || (k != "limit" && k != "cursor") {
			fail(w, 400)
			return
		}
	}
	if v, ok := q["limit"]; ok {
		n, e := strconv.Atoi(v[0])
		if e != nil || n < 1 || n > 50 || strconv.Itoa(n) != v[0] {
			fail(w, 400)
			return
		}
		limit = n
	}
	if v, ok := q["cursor"]; ok {
		b, e := base64.RawURLEncoding.Strict().DecodeString(v[0])
		parts := strings.Split(string(b), "\n")
		if e != nil || len(parts) != 2 || !uuidRE.MatchString(parts[0]) || len(parts[1]) > 64 || !slugRE.MatchString(parts[1]) {
			fail(w, 400)
			return
		}
		afterID, afterD = parts[0], parts[1]
	}
	if s.cfg.Onchain != nil {
		s.arbiterChainQueue(w, r, a, afterID, afterD, limit)
		return
	}
	rows, e := s.pool.Query(r.Context(), `SELECT e.task_id::text,e.deliverable_id,e.manifest_hash,e.version,e.artifact_hash,e.event_json FROM pactra.delivery_events e JOIN pactra.tasks t ON t.id=e.task_id WHERE (t.primary_arbiter=$1 OR t.backup_arbiter=$1) AND t.status='accepted_unfunded' AND e.kind='dispute' AND (e.task_id::text,e.deliverable_id)>($2,$3) ORDER BY e.task_id::text,e.deliverable_id LIMIT $4`, a, afterID, afterD, limit+1)
	if e != nil {
		fail(w, 503)
		return
	}
	defer rows.Close()
	items := []disputeSummary{}
	for rows.Next() {
		var d disputeSummary
		var raw string
		var event deliveryEvent
		if rows.Scan(&d.TaskID, &d.DeliverableID, &d.ManifestHash, &d.Version, &d.ArtifactHash, &raw) != nil || json.Unmarshal([]byte(raw), &event) != nil {
			fail(w, 503)
			return
		}
		d.CreatedAt = event.CreatedAt
		items = append(items, d)
	}
	if rows.Err() != nil {
		fail(w, 503)
		return
	}
	var next *string
	if len(items) > limit {
		items = items[:limit]
		last := items[len(items)-1]
		v := base64.RawURLEncoding.EncodeToString([]byte(last.TaskID + "\n" + last.DeliverableID))
		next = &v
	}
	respond(w, 200, map[string]any{"disputes": items, "next_cursor": next})
}
func (s *server) arbiterEvidence(w http.ResponseWriter, r *http.Request, a string) {
	id, did := r.PathValue("id"), r.PathValue("deliverable")
	if !uuidRE.MatchString(id) || len(did) > 64 || !slugRE.MatchString(did) {
		fail(w, 404)
		return
	}
	tx, e := s.pool.Begin(r.Context())
	if e != nil {
		fail(w, 503)
		return
	}
	defer tx.Rollback(r.Context())
	var raw, hash, status string
	e = tx.QueryRow(r.Context(), `SELECT manifest_json,manifest_hash,status FROM pactra.tasks t WHERE id=$1 AND ($2=primary_arbiter OR $2=backup_arbiter) AND status='accepted_unfunded' FOR UPDATE`, id, a).Scan(&raw, &hash, &status)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404)
		return
	}
	if e != nil {
		fail(w, 503)
		return
	}
	var m Manifest
	if json.Unmarshal([]byte(raw), &m) != nil {
		fail(w, 503)
		return
	}
	var d *Deliverable
	for i := range m.Deliverables {
		if m.Deliverables[i].ID == did {
			d = &m.Deliverables[i]
			break
		}
	}
	if d == nil {
		fail(w, 404)
		return
	}
	snapshot := deliverySnapshot{TaskID: id, DeliverableID: did, TaskStatus: status, UnfundedReview: true, ManifestHash: hash, RevisionLimit: d.RevisionLimit, Submissions: []json.RawMessage{}, Reviews: []json.RawMessage{}, Disputes: []json.RawMessage{}}
	if deliveryLoad(r.Context(), tx, &snapshot) != nil {
		fail(w, 503)
		return
	}
	life, e := s.boundLifecycle(r.Context(), tx, id, raw, hash)
	if e != nil {
		fail(w, 503)
		return
	}
	if snapshot.State != "disputed" && !chainDisputed(life, did) {
		fail(w, 404)
		return
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	respond(w, 200, map[string]any{"task_id": id, "deliverable_id": did, "manifest_hash": hash, "deliverable": d, "source": m.Source, "delivery": snapshot, "onchain": scopedLifecycle(life, did)})
}
