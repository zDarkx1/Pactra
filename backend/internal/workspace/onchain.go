package workspace

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/jackc/pgx/v5"
)

const OnchainSchemaQuery = `SELECT coalesce(bool_and(to_regclass('pactra.'||name) IS NOT NULL AND has_table_privilege(current_user,to_regclass('pactra.'||name),'SELECT') AND has_table_privilege(current_user,to_regclass('pactra.'||name),'INSERT')),false) FROM (VALUES ('onchain_bindings'),('availability_attestations')) AS required(name)`

func (s *server) registerOnchain(m *http.ServeMux) {
	m.HandleFunc("GET /api/v1/onchain/config", s.auth(s.onchainConfig))
	m.HandleFunc("GET /api/v1/tasks/{id}/onchain", s.auth(func(w http.ResponseWriter, r *http.Request, a string) { s.onchain(w, r, a, false) }))
	m.HandleFunc("POST /api/v1/tasks/{id}/onchain/reconcile", s.auth(func(w http.ResponseWriter, r *http.Request, a string) { s.onchain(w, r, a, true) }))
	m.HandleFunc("POST /api/v1/tasks/{id}/deliverables/{deliverable}/onchain/availability", s.auth(s.availability))
}
func (s *server) onchainConfig(w http.ResponseWriter, r *http.Request, a string) {
	c := s.cfg.Onchain
	escrow := ""
	confirmations := uint64(1)
	enabled := c != nil
	if enabled {
		escrow = c.Escrow
		confirmations = c.Confirmations
	}
	respond(w, 200, map[string]any{"enabled": enabled, "chain_id": strconv.FormatInt(s.cfg.ChainID, 10), "escrow_address": escrow, "confirmations": confirmations, "attestation_available": enabled && c.key != nil})
}
func (s *server) chainTask(w http.ResponseWriter, r *http.Request, a string) (pgx.Tx, Manifest, string, bool) {
	var m Manifest
	id := r.PathValue("id")
	if !uuidRE.MatchString(id) {
		fail(w, 404)
		return nil, m, "", false
	}
	tx, e := s.pool.Begin(r.Context())
	if e != nil {
		fail(w, 503)
		return nil, m, "", false
	}
	var raw, content, status string
	e = tx.QueryRow(r.Context(), `SELECT manifest_json,manifest_hash,status FROM pactra.tasks WHERE id=$1 AND ($2=buyer OR $2=worker) FOR UPDATE`, id, a).Scan(&raw, &content, &status)
	abort := func(code int) (pgx.Tx, Manifest, string, bool) {
		tx.Rollback(r.Context())
		fail(w, code)
		return nil, m, "", false
	}
	if errors.Is(e, pgx.ErrNoRows) {
		return abort(404)
	}
	if e != nil {
		return abort(503)
	}
	if s.cfg.Onchain == nil {
		return abort(503)
	}
	if status != "accepted_unfunded" {
		return abort(409)
	}
	sum := sha256.Sum256([]byte(raw))
	if json.Unmarshal([]byte(raw), &m) != nil || hex.EncodeToString(sum[:]) != content {
		return abort(503)
	}
	return tx, m, content, true
}
func loadProof(r *http.Request, tx pgx.Tx) (chainProof, error) {
	var p chainProof
	var raw string
	e := tx.QueryRow(r.Context(), "SELECT proof_json FROM pactra.onchain_bindings WHERE task_id=$1", r.PathValue("id")).Scan(&raw)
	if e != nil {
		return p, e
	}
	e = json.Unmarshal([]byte(raw), &p)
	return p, e
}
func (s *server) onchain(w http.ResponseWriter, r *http.Request, a string, reconcile bool) {
	tx, m, content, ok := s.chainTask(w, r, a)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	c := s.cfg.Onchain
	var in struct {
		TransactionHash string `json:"transaction_hash"`
	}
	if reconcile {
		if !decode(w, r, &in) {
			return
		}
		if in.TransactionHash != "" && !chainHashRE.MatchString(in.TransactionHash) {
			fail(w, 400)
			return
		}
	}
	stored, e := loadProof(r, tx)
	if e != nil && !errors.Is(e, pgx.ErrNoRows) {
		fail(w, 503)
		return
	}
	exists := e == nil
	if !exists && !reconcile {
		fail(w, 404)
		return
	}
	lookup := in.TransactionHash
	if exists {
		lookup = stored.TransactionHash
	}
	if lookup == "" {
		fail(w, 400)
		return
	}
	proof, e := c.verifyCreation(r.Context(), lookup, m, content)
	if e != nil {
		fail(w, 503)
		return
	}
	proof.TaskID = r.PathValue("id")
	if exists && stored != proof {
		fail(w, 409)
		return
	}
	if !exists {
		raw, e := json.Marshal(proof)
		if e != nil {
			fail(w, 503)
			return
		}
		_, e = tx.Exec(r.Context(), `INSERT INTO pactra.onchain_bindings(task_id,chain_id,escrow_address,onchain_task_id,proof_json) VALUES($1,$2,$3,$4,$5)`, proof.TaskID, proof.ChainID, proof.Escrow, proof.OnchainTaskID, string(raw))
		if e != nil {
			fail(w, 409)
			return
		}
	}
	life, e := c.lifecycle(r.Context(), proof, m, content)
	if e != nil || linkLocalEvidence(r.Context(), tx, proof.TaskID, &life) != nil {
		fail(w, 503)
		return
	}
	if reconcile && in.TransactionHash != "" {
		found := false
		for _, event := range life.Events {
			if strings.EqualFold(event.TransactionHash, in.TransactionHash) {
				found = true
				break
			}
		}
		if !found {
			fail(w, 409)
			return
		}
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	respond(w, 200, struct {
		chainProof
		Lifecycle lifecycleSnapshot `json:"lifecycle"`
	}{proof, life})
}

type availabilityResponse struct {
	TaskID         string `json:"task_id"`
	DeliverableID  string `json:"deliverable_id"`
	OnchainTaskID  string `json:"onchain_task_id"`
	Index          int    `json:"index"`
	Round          string `json:"round"`
	ArtifactHash   string `json:"artifact_hash"`
	ManifestDigest string `json:"manifest_digest"`
	Expiry         string `json:"expiry"`
	Digest         string `json:"digest"`
	Signature      string `json:"signature"`
	ChainID        string `json:"chain_id"`
	Escrow         string `json:"escrow_address"`
}

func (s *server) availability(w http.ResponseWriter, r *http.Request, a string) {
	tx, m, content, ok := s.chainTask(w, r, a)
	if !ok {
		return
	}
	defer tx.Rollback(r.Context())
	if a != m.Worker {
		fail(w, 403)
		return
	}
	c := s.cfg.Onchain
	if c.key == nil {
		fail(w, 503)
		return
	}
	var in struct {
		ArtifactHash    string `json:"artifact_hash"`
		ExpectedVersion int    `json:"expected_version"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !deliveryHashRE.MatchString(in.ArtifactHash) || in.ExpectedVersion < 1 || in.ExpectedVersion > 6 {
		fail(w, 400)
		return
	}
	did := r.PathValue("deliverable")
	index := -1
	for i, d := range m.Deliverables {
		if d.ID == did {
			index = i
			break
		}
	}
	if index < 0 {
		fail(w, 404)
		return
	}
	snapshot := deliverySnapshot{TaskID: r.PathValue("id"), DeliverableID: did}
	if deliveryLoad(r.Context(), tx, &snapshot) != nil {
		fail(w, 503)
		return
	}
	if snapshot.State != "submitted" || snapshot.LatestVersion != in.ExpectedVersion || snapshot.LatestArtifactHash != in.ArtifactHash || len(snapshot.Submissions) == 0 {
		fail(w, 409)
		return
	}
	// Same immutable row/history read used by the designated buyer's submissions
	// endpoint. Embedded JSON is persisted data, not an untrusted URL/SSRF fetch.
	var event deliveryEvent
	if json.Unmarshal(snapshot.Submissions[len(snapshot.Submissions)-1], &event) != nil || event.Actor != m.Worker || event.ManifestHash != content || len(event.Artifact) == 0 {
		fail(w, 503)
		return
	}
	var artifact map[string]string
	if json.Unmarshal(event.Artifact, &artifact) != nil || artifact == nil {
		fail(w, 503)
		return
	}
	canonical, e := canonicalJSON(artifact)
	if e != nil {
		fail(w, 503)
		return
	}
	sum := sha256.Sum256(canonical)
	if hex.EncodeToString(sum[:]) != in.ArtifactHash {
		fail(w, 409)
		return
	}
	proof, e := loadProof(r, tx)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 409)
		return
	}
	if e != nil {
		fail(w, 503)
		return
	}
	verified, e := c.verifyCreation(r.Context(), proof.TransactionHash, m, content)
	verified.TaskID = proof.TaskID
	if e != nil || verified != proof {
		fail(w, 503)
		return
	}
	block, e := c.confirmedBlock(r.Context())
	if e != nil {
		fail(w, 503)
		return
	}
	id, _ := new(big.Int).SetString(proof.OnchainTaskID, 10)
	task, e := c.verifyTask(r.Context(), block, id, m, content)
	if e != nil {
		fail(w, 503)
		return
	}
	d, e := c.deliverable(r.Context(), block, id, index)
	if e != nil || len(d) != 14*32 {
		fail(w, 503)
		return
	}
	round := int(uintWord(d, 4).Int64()) + 1
	stamp, e := quantity(block.Timestamp)
	now := time.Now().Unix()
	if c.now != nil {
		now = c.now().Unix()
	}
	if e != nil || !stamp.IsInt64() || stamp.Int64() > now+30 || stamp.Int64() < now-300 {
		fail(w, 503)
		return
	}
	if uintWord(task, 6).Int64() != 2 || uintWord(d, 3).Sign() != 0 || round != in.ExpectedVersion || round > m.Deliverables[index].RevisionLimit+1 || uintWord(d, 11).Sign() == 0 && now > m.DeliveryDeadline.Unix() {
		fail(w, 409)
		return
	}
	// Compute the best available expiry before deciding whether renewal helps.
	// Initial submissions cannot extend past their immutable delivery deadline.
	expiry := uint64(now + 120)
	if uintWord(d, 11).Sign() == 0 && int64(expiry) > m.DeliveryDeadline.Unix() {
		expiry = uint64(m.DeliveryDeadline.Unix())
	}
	if int64(expiry) <= now {
		fail(w, 409)
		return
	}
	var oldRaw string
	e = tx.QueryRow(r.Context(), `SELECT response_json FROM pactra.availability_attestations WHERE task_id=$1 AND deliverable_id=$2 AND round=$3 ORDER BY expiry DESC LIMIT 1`, proof.TaskID, did, round).Scan(&oldRaw)
	if e != nil && !errors.Is(e, pgx.ErrNoRows) {
		fail(w, 503)
		return
	}
	if e == nil {
		var old availabilityResponse
		if json.Unmarshal([]byte(oldRaw), &old) != nil || old.ArtifactHash != in.ArtifactHash {
			fail(w, 409)
			return
		}
		oldExpiry, e := strconv.ParseInt(old.Expiry, 10, 64)
		if e != nil {
			fail(w, 503)
			return
		}
		// Keep the exact persisted receipt if it is still valid and renewal
		// cannot improve its expiry (notably the last 30s of a capped round).
		// The task lock serializes retries; no duplicate append or overwrite.
		if oldExpiry > now && (oldExpiry > now+30 || oldExpiry >= int64(expiry)) {
			if c.canonical(r.Context(), block) != nil || tx.Commit(r.Context()) != nil {
				fail(w, 503)
				return
			}
			respond(w, 200, old)
			return
		}
	}
	digest := c.submissionDigest(id, big.NewInt(int64(index)), big.NewInt(int64(round)), proof.ManifestDigest, in.ArtifactHash, expiry)
	cross, e := c.call(r.Context(), block, "submissionDigest(uint256,uint256,uint256,bytes32,uint64)", word(id), number(int64(index)), number(int64(round)), hashWord(in.ArtifactHash), word(new(big.Int).SetUint64(expiry)))
	if e != nil || !bytes.Equal(cross, digest) || c.canonical(r.Context(), block) != nil {
		fail(w, 503)
		return
	}
	sig, e := crypto.Sign(digest, c.key)
	if e != nil {
		fail(w, 503)
		return
	}
	sig[64] += 27
	out := availabilityResponse{TaskID: proof.TaskID, DeliverableID: did, OnchainTaskID: id.String(), Index: index, Round: strconv.Itoa(round), ArtifactHash: in.ArtifactHash, ManifestDigest: proof.ManifestDigest, Expiry: strconv.FormatUint(expiry, 10), Digest: hexData(digest), Signature: hexData(sig), ChainID: proof.ChainID, Escrow: proof.Escrow}
	raw, e := json.Marshal(out)
	if e != nil {
		fail(w, 503)
		return
	}
	_, e = tx.Exec(r.Context(), `INSERT INTO pactra.availability_attestations(task_id,deliverable_id,round,artifact_hash,expiry,response_json) VALUES($1,$2,$3,$4,$5,$6)`, proof.TaskID, did, round, in.ArtifactHash, int64(expiry), string(raw))
	if e != nil || tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	respond(w, 200, out)
}
