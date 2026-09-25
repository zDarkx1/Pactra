package workspace

import (
	"bytes"
	"context"
	"encoding/json"
	"math/big"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// Snapshots are observations, not replacements for immutable workspace reviews.
type chainRevisionLink struct {
	BlockNumber string `json:"block_number"`
	BlockHash   string `json:"block_hash"`
	Round       int    `json:"round"`
}

func (c *OnchainConfig) checkObservation(ctx context.Context, life *lifecycleSnapshot) error {
	n, ok := new(big.Int).SetString(life.BlockNumber, 10)
	if !ok {
		return errChain
	}
	return c.canonical(ctx, chainBlock{Number: "0x" + n.Text(16), Hash: life.BlockHash})
}

type chainAllocation struct {
	DeliverableID       string `json:"deliverable_id"`
	Index               int    `json:"index"`
	State               string `json:"state"`
	Round               string `json:"round"`
	EvidenceRound       string `json:"evidence_round"`
	RevisionsUsed       string `json:"revisions_used"`
	SubmittedAt         string `json:"submitted_at"`
	DisputeOpenedAt     string `json:"dispute_opened_at"`
	HandoverAt          string `json:"handover_at"`
	WorkerAward         string `json:"worker_award"`
	BuyerRefund         string `json:"buyer_refund"`
	EverSubmitted       bool   `json:"ever_submitted"`
	ArtifactHash        string `json:"artifact_hash"`
	AttestationExpiry   string `json:"attestation_expiry"`
	SettlementNonce     string `json:"settlement_nonce"`
	LocalState          string `json:"local_state"`
	LocalVersion        int    `json:"local_version"`
	EvidenceMatches     bool   `json:"evidence_matches"`
	NextLocalSubmission bool   `json:"next_local_submission"`
}
type lifecycleEvent struct {
	Name            string   `json:"name"`
	Index           *int     `json:"index,omitempty"`
	TransactionHash string   `json:"transaction_hash"`
	BlockNumber     string   `json:"block_number"`
	BlockHash       string   `json:"block_hash"`
	LogIndex        string   `json:"log_index"`
	Data            string   `json:"data"`
	Topics          []string `json:"topics"`
}
type lifecycleSnapshot struct {
	ChainID        string            `json:"chain_id"`
	Escrow         string            `json:"escrow_address"`
	OnchainTaskID  string            `json:"onchain_task_id"`
	ManifestDigest string            `json:"manifest_digest"`
	BlockNumber    string            `json:"block_number"`
	BlockHash      string            `json:"block_hash"`
	Timestamp      string            `json:"timestamp"`
	TaskState      string            `json:"task_state"`
	SettledCount   string            `json:"settled_count"`
	Allocations    []chainAllocation `json:"allocations"`
	Events         []lifecycleEvent  `json:"events"`
}
type eventSpec struct {
	signature     string
	topics, words int
	allocation    bool
}

var lifecycleSpecs = []eventSpec{
	{"TaskCreated(uint256,address,address,address,address,bytes32,uint256,uint256)", 3, 6, false},
	{"DeliverableConfigured(uint256,uint256,uint128,uint16,uint64)", 3, 3, true},
	{"DeliveryDeadlineConfigured(uint256,uint256,uint64)", 3, 1, true},
	{"WorkerAccepted(uint256,address)", 3, 0, false},
	{"TaskFunded(uint256,uint256)", 2, 1, false},
	{"SubmissionRecorded(uint256,uint256,uint256)", 3, 1, true},
	{"EvidenceRecorded(uint256,uint256,uint256,bytes32,uint64)", 3, 3, true},
	{"RevisionRequested(uint256,uint256,uint256)", 3, 1, true},
	{"DisputeOpened(uint256,uint256,address,uint64)", 4, 1, true},
	{"DisputeHandover(uint256,uint256,uint64)", 3, 1, true},
	{"DisputeResolved(uint256,uint256,address,uint128,uint128)", 4, 2, true},
	{"DeliverableAccepted(uint256,uint256,uint128)", 3, 1, true},
	{"TimeoutClaimed(uint256,uint256,uint128)", 3, 1, true},
	{"UnsubmittedRefunded(uint256,uint256,uint128)", 3, 1, true},
	{"AgreementSettled(uint256,uint256,uint128,uint128,uint256)", 3, 3, true},
	{"TaskCompleted(uint256)", 2, 0, false},
}

// Logs are linked to successful receipts and canonical blocks. State is always
// independently read at the same confirmed block, never inferred from a hint.
func (c *OnchainConfig) lifecycle(ctx context.Context, p chainProof, m Manifest, content string) (lifecycleSnapshot, error) {
	out := lifecycleSnapshot{Allocations: []chainAllocation{}, Events: []lifecycleEvent{}}
	out.ChainID, out.Escrow, out.OnchainTaskID, out.ManifestDigest = p.ChainID, p.Escrow, p.OnchainTaskID, p.ManifestDigest
	b, e := c.confirmedBlock(ctx)
	if e != nil {
		return out, e
	}
	id, ok := new(big.Int).SetString(p.OnchainTaskID, 10)
	if !ok {
		return out, errChain
	}
	start, ok := new(big.Int).SetString(p.BlockNumber, 10)
	if !ok {
		return out, errChain
	}
	end, e := quantity(b.Number)
	if e != nil || end.Cmp(start) < 0 || new(big.Int).Sub(end, start).Cmp(big.NewInt(200000)) > 0 {
		return out, errChain
	}
	task, e := c.verifyTask(ctx, b, id, m, content)
	if e != nil {
		return out, e
	}
	state := uintWord(task, 6)
	if !state.IsUint64() || state.Uint64() > 3 {
		return out, errChain
	}
	out.TaskState = []string{"awaiting_worker", "accepted_unfunded", "funded", "completed"}[state.Uint64()]
	out.SettledCount = uintWord(task, 8).String()
	stamp, e := quantity(b.Timestamp)
	if e != nil {
		return out, e
	}
	out.BlockNumber, out.BlockHash, out.Timestamp = end.String(), b.Hash, stamp.String()
	for i, d := range m.Deliverables {
		raw, e := c.deliverable(ctx, b, id, i)
		if e != nil {
			return out, e
		}
		status := uintWord(raw, 3)
		if !status.IsUint64() || status.Uint64() > 3 {
			return out, errChain
		}
		nonce, e := c.call(ctx, b, "settlementNonces(uint256,uint256)", word(id), number(int64(i)))
		if e != nil || len(nonce) != 32 {
			return out, errChain
		}
		out.Allocations = append(out.Allocations, chainAllocation{DeliverableID: d.ID, Index: i, State: []string{"awaiting_submission", "in_review", "disputed", "settled"}[status.Uint64()], Round: new(big.Int).Add(uintWord(raw, 4), big.NewInt(1)).String(), RevisionsUsed: uintWord(raw, 4).String(), SubmittedAt: uintWord(raw, 5).String(), DisputeOpenedAt: uintWord(raw, 6).String(), HandoverAt: uintWord(raw, 7).String(), WorkerAward: uintWord(raw, 8).String(), BuyerRefund: uintWord(raw, 9).String(), EverSubmitted: uintWord(raw, 11).Sign() != 0, ArtifactHash: hexData(raw[12*32 : 13*32]), AttestationExpiry: uintWord(raw, 13).String(), SettlementNonce: uintWord(nonce, 0).String()})
	}
	specs := map[string]eventSpec{}
	for _, s := range lifecycleSpecs {
		specs[hexData(hash([]byte(s.signature)))] = s
	}
	receipts := map[string]chainReceipt{}
	var previousBlock, previousLog *big.Int
	for from := new(big.Int).Set(start); from.Cmp(end) <= 0; from.Add(from, big.NewInt(2000)) {
		to := new(big.Int).Add(from, big.NewInt(1999))
		if to.Cmp(end) > 0 {
			to.Set(end)
		}
		var logs []chainLog
		if c.rpc(ctx, "eth_getLogs", []any{map[string]any{"address": c.Escrow, "fromBlock": "0x" + from.Text(16), "toBlock": "0x" + to.Text(16), "topics": []any{nil, hexData(word(id))}}}, &logs) != nil {
			return out, errChain
		}
		for _, l := range logs {
			if len(out.Events) >= 4096 || l.Removed || !strings.EqualFold(l.Address, c.Escrow) || len(l.Topics) < 2 || l.Topics[1] != hexData(word(id)) || !chainHashRE.MatchString(l.TransactionHash) || !chainHashRE.MatchString(l.BlockHash) {
				return out, errChain
			}
			spec, ok := specs[l.Topics[0]]
			if !ok || len(l.Topics) != spec.topics {
				return out, errChain
			}
			for _, topic := range l.Topics {
				if !chainHashRE.MatchString(topic) {
					return out, errChain
				}
			}
			data, e := dataBytes(l.Data)
			if e != nil || len(data) != spec.words*32 {
				return out, errChain
			}
			bn, e := quantity(l.BlockNumber)
			if e != nil || bn.Cmp(from) < 0 || bn.Cmp(to) > 0 {
				return out, errChain
			}
			li, e := quantity(l.LogIndex)
			if e != nil {
				return out, errChain
			}
			if previousBlock != nil && (bn.Cmp(previousBlock) < 0 || bn.Cmp(previousBlock) == 0 && li.Cmp(previousLog) <= 0) {
				return out, errChain
			}
			previousBlock, previousLog = bn, li
			receipt, ok := receipts[l.TransactionHash]
			if !ok {
				if c.rpc(ctx, "eth_getTransactionReceipt", []any{l.TransactionHash}, &receipt) != nil {
					return out, errChain
				}
				receipts[l.TransactionHash] = receipt
			}
			if receipt.Status != "0x1" || receipt.TransactionHash != l.TransactionHash || receipt.BlockHash != l.BlockHash || receipt.BlockNumber != l.BlockNumber || c.canonical(ctx, chainBlock{Number: l.BlockNumber, Hash: l.BlockHash}) != nil {
				return out, errChain
			}
			matched := false
			for _, rl := range receipt.Logs {
				x, _ := json.Marshal(rl)
				y, _ := json.Marshal(l)
				if bytes.Equal(x, y) {
					matched = true
					break
				}
			}
			if !matched {
				return out, errChain
			}
			ev := lifecycleEvent{Name: strings.Split(spec.signature, "(")[0], TransactionHash: l.TransactionHash, BlockNumber: bn.String(), BlockHash: l.BlockHash, LogIndex: li.String(), Data: l.Data, Topics: l.Topics}
			if spec.allocation {
				n := new(big.Int).SetBytes(hashWord(l.Topics[2]))
				if !n.IsInt64() || n.Int64() >= int64(len(m.Deliverables)) {
					return out, errChain
				}
				i := int(n.Int64())
				ev.Index = &i
			}
			out.Events = append(out.Events, ev)
		}
	}
	// Minimum event/state linkage: omissions cannot grant a chain-only case.
	for i := range out.Allocations {
		d := &out.Allocations[i]
		evidence, dispute, handover, settlement, revision := false, false, false, false, d.RevisionsUsed == "0"
		for _, ev := range out.Events {
			if ev.Index == nil || *ev.Index != d.Index {
				continue
			}
			data, _ := dataBytes(ev.Data)
			switch ev.Name {
			case "EvidenceRecorded":
				evidence = hexData(data[32:64]) == d.ArtifactHash && uintWord(data, 2).String() == d.AttestationExpiry
				d.EvidenceRound = uintWord(data, 0).String()
			case "RevisionRequested":
				revision = uintWord(data, 0).String() == d.RevisionsUsed
			case "DisputeOpened":
				dispute = uintWord(data, 0).String() == d.DisputeOpenedAt
			case "DisputeHandover":
				handover = uintWord(data, 0).String() == d.HandoverAt
			case "DisputeResolved", "AgreementSettled":
				settlement = uintWord(data, 0).String() == d.WorkerAward && uintWord(data, 1).String() == d.BuyerRefund
			case "DeliverableAccepted", "TimeoutClaimed":
				settlement = uintWord(data, 0).String() == d.WorkerAward && d.BuyerRefund == "0"
			case "UnsubmittedRefunded":
				settlement = uintWord(data, 0).String() == d.BuyerRefund && d.WorkerAward == "0"
			}
		}
		if !revision || d.EverSubmitted && !evidence || d.DisputeOpenedAt != "0" && !dispute || d.HandoverAt != "0" && !handover || d.State == "settled" && !settlement {
			return out, errChain
		}
		if d.EverSubmitted {
			expected := d.Round
			if d.State == "awaiting_submission" {
				expected = d.RevisionsUsed
			}
			if d.EvidenceRound != expected {
				return out, errChain
			}
		}
	}
	created, funded, accepted, completed := false, false, false, false
	for _, ev := range out.Events {
		if ev.Name == "TaskCreated" && ev.TransactionHash == p.TransactionHash {
			created = true
		}
		if ev.Name == "TaskFunded" {
			data, _ := dataBytes(ev.Data)
			funded = uintWord(data, 0).String() == m.Total
		}
		if ev.Name == "WorkerAccepted" {
			accepted = bytes.Equal(hashWord(ev.Topics[2]), addrWord(m.Worker))
		}
		if ev.Name == "TaskCompleted" {
			completed = true
		}
	}
	settled := 0
	for _, d := range out.Allocations {
		if d.State == "settled" {
			settled++
		}
	}
	if strconv.Itoa(settled) != out.SettledCount || out.TaskState == "completed" && (!completed || settled != len(out.Allocations)) || out.TaskState != "awaiting_worker" && !accepted || !created || (out.TaskState == "funded" || out.TaskState == "completed") && !funded || c.canonical(ctx, b) != nil || c.checkChain(ctx) != nil {
		return out, errChain
	}
	return out, nil
}

func linkLocalEvidence(ctx context.Context, tx pgx.Tx, taskID string, life *lifecycleSnapshot) error {
	for i := range life.Allocations {
		d := &life.Allocations[i]
		local := deliverySnapshot{TaskID: taskID, DeliverableID: d.DeliverableID, State: "not_submitted"}
		if e := deliveryLoad(ctx, tx, &local); e != nil {
			return e
		}
		d.LocalState, d.LocalVersion = local.State, local.LatestVersion
		d.EvidenceMatches = d.EverSubmitted && d.ArtifactHash == "0x"+local.LatestArtifactHash && d.EvidenceRound == strconv.Itoa(local.LatestVersion)
		round, e := strconv.Atoi(d.Round)
		if e != nil {
			return errChain
		}
		d.NextLocalSubmission = life.TaskState == "funded" && d.State == "awaiting_submission" && round == local.LatestVersion+1 && (local.State == "not_submitted" || (local.State == "submitted" || local.State == "revision_requested") && d.EvidenceMatches)
	}
	return nil
}
