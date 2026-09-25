package workspace

import (
	"context"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestChainLocalLinkNeverRewritesTerminalHistory(t *testing.T) {
	for _, terminal := range []string{"accepted", "disputed"} {
		t.Run(terminal, func(t *testing.T) {
			f := deliverySetup(t, true, 2)
			snap := f.call(t, "submissions", 1, f.submitInput(0, ""), 201)
			in := f.input(1, deliveryHash(snap))
			if terminal == "accepted" {
				in["decision"] = "accept"
				f.call(t, "reviews", 0, in, 201)
			} else {
				f.call(t, "disputes", 0, in, 201)
			}
			tx, e := f.p.Begin(context.Background())
			if e != nil {
				t.Fatal(e)
			}
			defer tx.Rollback(context.Background())
			life := lifecycleSnapshot{TaskState: "funded", Allocations: []chainAllocation{{DeliverableID: "proof-1", State: "awaiting_submission", Round: "2", EvidenceRound: "1", EverSubmitted: true, ArtifactHash: "0x" + deliveryHash(snap)}}}
			if linkLocalEvidence(context.Background(), tx, f.id, &life) != nil || life.Allocations[0].NextLocalSubmission || life.Allocations[0].LocalState != terminal {
				t.Fatal(life)
			}
			tx.Rollback(context.Background())
			f.call(t, "submissions", 1, f.submitInput(1, deliveryHash(snap)), 409)
			got := f.call(t, "submissions", 0, nil, 200)
			if got["state"] != terminal {
				t.Fatal(got)
			}
		})
	}
}

func TestChainObservationCanonicalBlockCheck(t *testing.T) {
	// Negative-only RPC fixture: a changed canonical block can never be accepted.
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": chainBlock{Number: "0x7", Hash: hexData(word(big.NewInt(8)))}})
	}))
	defer srv.Close()
	c := &OnchainConfig{RPCURL: srv.URL}
	if c.checkObservation(context.Background(), &lifecycleSnapshot{BlockNumber: "7", BlockHash: hexData(word(big.NewInt(7)))}) == nil {
		t.Fatal("accepted replaced current block")
	}
}

func TestLifecycleScopeDoesNotLeakSiblingEvents(t *testing.T) {
	i, j := 0, 1
	life := &lifecycleSnapshot{Allocations: []chainAllocation{{DeliverableID: "a", Index: i}, {DeliverableID: "b", Index: j}}, Events: []lifecycleEvent{{Name: "EvidenceRecorded", Index: &i, Data: "allowed"}, {Name: "EvidenceRecorded", Index: &j, Data: "sibling artifact"}, {Name: "TaskCreated", Data: "taskwide"}}}
	raw, _ := json.Marshal(scopedLifecycle(life, "a"))
	var got lifecycleSnapshot
	json.Unmarshal(raw, &got)
	if len(got.Allocations) != 1 || len(got.Events) != 1 || got.Events[0].Data != "allowed" {
		t.Fatal(string(raw))
	}
}
