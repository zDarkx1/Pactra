package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

// A missing binding is not chain evidence. An invalid existing binding is an
// outage, never permission to serve a cached chain-only dispute.
func (s *server) boundLifecycle(ctx context.Context, tx pgx.Tx, id, raw, content string) (*lifecycleSnapshot, error) {
	if s.cfg.Onchain == nil {
		return nil, nil
	}
	var proofRaw string
	e := tx.QueryRow(ctx, "SELECT proof_json FROM pactra.onchain_bindings WHERE task_id=$1", id).Scan(&proofRaw)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, nil
	}
	if e != nil {
		return nil, e
	}
	sum := sha256.Sum256([]byte(raw))
	var m Manifest
	var p chainProof
	if hex.EncodeToString(sum[:]) != content || json.Unmarshal([]byte(raw), &m) != nil || json.Unmarshal([]byte(proofRaw), &p) != nil {
		return nil, errChain
	}
	verified, e := s.cfg.Onchain.verifyCreation(ctx, p.TransactionHash, m, content)
	verified.TaskID = id
	if e != nil || verified != p {
		return nil, errChain
	}
	life, e := s.cfg.Onchain.lifecycle(ctx, p, m, content)
	if e != nil {
		return nil, e
	}
	if e = linkLocalEvidence(ctx, tx, id, &life); e != nil {
		return nil, e
	}
	return &life, nil
}

// Arbiters receive only their disputed allocation and its events. Task-wide
// allocation lists must never be embedded in a scoped evidence response.
func scopedLifecycle(life *lifecycleSnapshot, did string) *lifecycleSnapshot {
	if life == nil {
		return nil
	}
	out := *life
	out.Allocations = []chainAllocation{}
	out.Events = []lifecycleEvent{}
	for _, d := range life.Allocations {
		if d.DeliverableID == did {
			out.Allocations = append(out.Allocations, d)
			for _, ev := range life.Events {
				if ev.Index != nil && *ev.Index == d.Index {
					out.Events = append(out.Events, ev)
				}
			}
			break
		}
	}
	return &out
}
func chainDisputed(life *lifecycleSnapshot, did string) bool {
	if life != nil {
		for _, d := range life.Allocations {
			if d.DeliverableID == did && d.State == "disputed" {
				return true
			}
		}
	}
	return false
}
