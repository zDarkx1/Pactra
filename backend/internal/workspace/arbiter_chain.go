package workspace

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"
	"time"
)

func (s *server) arbiterChainQueue(w http.ResponseWriter, r *http.Request, a, afterID, afterD string, limit int) {
	tx, e := s.pool.Begin(r.Context())
	if e != nil {
		fail(w, 503)
		return
	}
	defer tx.Rollback(r.Context())
	// Paginate candidate allocations, not just results: bounded scanning makes an
	// empty page with a non-null cursor legitimate and avoids skipping disputes.
	rows, e := tx.Query(r.Context(), `SELECT t.id::text,d->>'id',t.manifest_json,t.manifest_hash FROM pactra.tasks t CROSS JOIN LATERAL jsonb_array_elements(t.manifest_json::jsonb->'deliverables') d WHERE (t.primary_arbiter=$1 OR t.backup_arbiter=$1) AND t.status='accepted_unfunded' AND (t.id::text,d->>'id')>($2,$3) AND (EXISTS(SELECT 1 FROM pactra.onchain_bindings b WHERE b.task_id=t.id) OR EXISTS(SELECT 1 FROM pactra.delivery_events e WHERE e.task_id=t.id AND e.deliverable_id=d->>'id' AND e.kind='dispute')) ORDER BY t.id::text,d->>'id' LIMIT $4`, a, afterID, afterD, limit+1)
	if e != nil {
		fail(w, 503)
		return
	}
	type candidate struct{ id, did, raw, content string }
	candidates := []candidate{}
	for rows.Next() {
		var v candidate
		if rows.Scan(&v.id, &v.did, &v.raw, &v.content) != nil {
			rows.Close()
			fail(w, 503)
			return
		}
		candidates = append(candidates, v)
	}
	e = rows.Err()
	rows.Close()
	if e != nil {
		fail(w, 503)
		return
	}
	var next *string
	if len(candidates) > limit {
		candidates = candidates[:limit]
		last := candidates[len(candidates)-1]
		v := base64.RawURLEncoding.EncodeToString([]byte(last.id + "\n" + last.did))
		next = &v
	}
	items := []disputeSummary{}
	lives := map[string]*lifecycleSnapshot{}
	for _, v := range candidates {
		life, ok := lives[v.id]
		if !ok {
			life, e = s.boundLifecycle(r.Context(), tx, v.id, v.raw, v.content)
			if e != nil {
				fail(w, 503)
				return
			}
			lives[v.id] = life
		}
		local := deliverySnapshot{TaskID: v.id, DeliverableID: v.did}
		if deliveryLoad(r.Context(), tx, &local) != nil {
			fail(w, 503)
			return
		}
		chain := chainDisputed(life, v.did)
		if local.State != "disputed" && !chain {
			continue
		}
		d := disputeSummary{TaskID: v.id, DeliverableID: v.did, ManifestHash: v.content, Version: local.LatestVersion, ArtifactHash: local.LatestArtifactHash, EvidenceSource: "workspace"}
		if local.State == "disputed" {
			var ev deliveryEvent
			if len(local.Disputes) == 0 || json.Unmarshal(local.Disputes[len(local.Disputes)-1], &ev) != nil {
				fail(w, 503)
				return
			}
			d.CreatedAt = ev.CreatedAt
		}
		if chain {
			d.EvidenceSource = "onchain"
			d.Onchain = scopedLifecycle(life, v.did)
			stamp, e := strconv.ParseInt(d.Onchain.Allocations[0].DisputeOpenedAt, 10, 64)
			if e != nil {
				fail(w, 503)
				return
			}
			d.CreatedAt = time.Unix(stamp, 0).UTC()
			if local.State == "disputed" {
				d.EvidenceSource = "workspace_and_onchain"
			}
		}
		items = append(items, d)
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	respond(w, 200, map[string]any{"disputes": items, "next_cursor": next})
}
