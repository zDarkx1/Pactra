package workspace

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/jackc/pgx/v5/pgxpool"
)

func toAddress(s string) common.Address { return common.HexToAddress(s) }
func toHash(s string) [32]byte          { return common.HexToHash(s) }

// Uses an isolated ephemeral loopback Anvil, never a configured/live network.
// Fixture accounts are generated wallet identities, never approved real arbiters.
func TestLocalEVMReconcileAndAvailability(t *testing.T) {
	runLocalEVMReconcileAndAvailability(t, false)
}

func TestLocalEVMDeadlineCappedAvailability(t *testing.T) {
	runLocalEVMReconcileAndAvailability(t, true)
}

func runLocalEVMReconcileAndAvailability(t *testing.T, capped bool) {
	if os.Getenv("PACTRA_LOCAL_EVM_TEST") != "1" {
		t.Skip("explicit local EVM opt-in required")
	}
	pc, e := pgxpool.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if e != nil || pc.ConnConfig.Database != "pactra_settlement_backend" || pc.ConnConfig.Port != 5546 || (pc.ConnConfig.Host != "/var/run/postgresql" && pc.ConnConfig.Host != "localhost" && pc.ConnConfig.Host != "127.0.0.1") {
		t.Fatal("local EVM test requires isolated pactra_settlement_backend on local5546")
	}

	root := "../../../contracts"
	raw, e := os.ReadFile(filepath.Join(root, "out/PactraEscrow.sol/PactraEscrow.json"))
	if e != nil {
		t.Fatal(e)
	}
	var artifact struct {
		ABI      json.RawMessage `json:"abi"`
		Bytecode struct {
			Object string `json:"object"`
		} `json:"bytecode"`
	}
	if json.Unmarshal(raw, &artifact) != nil {
		t.Fatal("artifact JSON")
	}
	contract, e := abi.JSON(strings.NewReader(string(artifact.ABI)))
	if e != nil {
		t.Fatal(e)
	}
	if _, ok := contract.Methods["submissionDigest"]; !ok {
		t.Fatal("contract worker v2 artifact not ready")
	}
	listener, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	cmd := exec.Command(filepath.Join(root, ".toolchain/anvil"), "--host", "127.0.0.1", "--port", big.NewInt(int64(port)).String(), "--chain-id", "1", "--silent")
	if e = cmd.Start(); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { cmd.Process.Kill(); cmd.Wait() })
	c := &OnchainConfig{RPCURL: "http://127.0.0.1:" + big.NewInt(int64(port)).String(), ChainID: 1, Confirmations: 1, key: key(t)}
	ctx := context.Background()
	deadline := time.Now().Add(10 * time.Second)
	for c.checkChain(ctx) != nil {
		if time.Now().After(deadline) {
			t.Fatal("local anvil readiness")
		}
		time.Sleep(20 * time.Millisecond)
	}
	var accounts []string
	if c.rpc(ctx, "eth_accounts", []any{}, &accounts) != nil {
		t.Fatal("local accounts")
	}
	send := func(from, to, data, value string) string {
		t.Helper()
		var hash string
		tx := map[string]string{"from": from, "data": data, "gas": "0x989680"}
		if to != "" {
			tx["to"] = to
		}
		if value != "" {
			tx["value"] = value
		}
		if e := c.rpc(ctx, "eth_sendTransaction", []any{tx}, &hash); e != nil {
			t.Fatal("local send", e)
		}
		var r struct {
			Status          string `json:"status"`
			ContractAddress string `json:"contractAddress"`
		}
		until := time.Now().Add(5 * time.Second)
		for c.rpc(ctx, "eth_getTransactionReceipt", []any{hash}, &r) != nil {
			if time.Now().After(until) {
				t.Fatal("local receipt not mined")
			}
			time.Sleep(10 * time.Millisecond)
		}
		if r.Status != "0x1" {
			t.Fatal("local transaction reverted", r.Status)
		}
		if to == "" {
			c.Escrow = strings.ToLower(r.ContractAddress)
		}
		return hash
	}
	send(accounts[0], "", artifact.Bytecode.Object+hexData(addrWord(addr(c.key)))[2:], "")
	f := deliverySetup(t, true, 2, 1)
	var manifestRaw string
	f.p.QueryRow(ctx, "SELECT manifest_json FROM pactra.tasks WHERE id=$1", f.id).Scan(&manifestRaw)
	var m Manifest
	if json.Unmarshal([]byte(manifestRaw), &m) != nil {
		t.Fatal("manifest")
	}
	migration, e := os.ReadFile("../../migrations/0005_onchain.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = f.p.Exec(ctx, string(migration)); e != nil {
		t.Fatal(e)
	}
	for _, a := range []string{m.Buyer, m.Worker, m.PrimaryArbiter, m.BackupArbiter} {
		// Anvil administrative methods return JSON null on success. Production
		// read adapter deliberately rejects null receipts/state; do not weaken it.
		for method, params := range map[string][]any{"anvil_impersonateAccount": {a}, "anvil_setBalance": {a, "0x1000000000000000000"}} {
			b, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
			res, e := http.Post(c.RPCURL, "application/json", bytes.NewReader(b))
			if e != nil {
				t.Fatal(e)
			}
			raw, _ := io.ReadAll(res.Body)
			res.Body.Close()
			var out map[string]json.RawMessage
			if json.Unmarshal(raw, &out) != nil || out["error"] != nil {
				t.Fatal("local admin method", method, string(raw))
			}
		}
	}
	configs := []struct {
		Amount           *big.Int
		RevisionLimit    uint16
		ReviewWindow     uint64
		DeliveryDeadline uint64
	}{{big.NewInt(123), 2, 48 * 3600, uint64(m.DeliveryDeadline.Unix())}}
	configs = append(configs, configs[0])
	data, e := contract.Pack("createTask", toAddress(m.Worker), toAddress(m.PrimaryArbiter), toAddress(m.BackupArbiter), big.NewInt(1), uint64(m.Version), toHash(f.hash), configs)
	if e != nil {
		t.Fatal(e)
	}
	txhash := send(m.Buyer, c.Escrow, hexData(data), "")
	h, e := New(f.p, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1, Onchain: c})
	if e != nil {
		t.Fatal(e)
	}
	path := "/api/v1/tasks/" + f.id + "/onchain/reconcile"
	// Negative verification cases exercise real mined local receipts, not invented
	// successful chain fixtures. Wrong confirmations/deployment/terms fail closed.
	strict := *c
	strict.Confirmations = 100
	if _, e := strict.verifyCreation(ctx, txhash, m, f.hash); e == nil {
		t.Fatal("unconfirmed receipt accepted")
	}
	strict = *c
	strict.ChainID = 2
	if _, e := strict.verifyCreation(ctx, txhash, m, f.hash); e == nil {
		t.Fatal("wrong chain accepted")
	}
	strict = *c
	strict.Escrow = m.Worker
	if _, e := strict.verifyCreation(ctx, txhash, m, f.hash); e == nil {
		t.Fatal("foreign emitter accepted")
	}
	strict = *c
	strict.key = key(t)
	if _, e := strict.verifyCreation(ctx, txhash, m, f.hash); e == nil {
		t.Fatal("wrong signer accepted")
	}
	wrong := m
	wrong.Worker = m.Buyer
	if _, e := c.verifyCreation(ctx, txhash, wrong, f.hash); e == nil {
		t.Fatal("foreign participant accepted")
	}
	wrong = m
	wrong.Deliverables = append([]Deliverable(nil), m.Deliverables...)
	wrong.Deliverables[0].Amount = "124"
	if _, e := c.verifyCreation(ctx, txhash, wrong, f.hash); e == nil {
		t.Fatal("changed allocation accepted")
	}
	if _, e := c.verifyCreation(ctx, txhash, m, strings.Repeat("1", 64)); e == nil {
		t.Fatal("changed content accepted")
	}
	code, v := call(t, h, "POST", path, f.tokens[0], map[string]any{"transaction_hash": txhash, "status": "funded"})
	expect(t, 400, code, v)
	code, v = call(t, h, "POST", path, f.tokens[4], map[string]string{"transaction_hash": txhash})
	expect(t, 404, code, v)
	// Both concurrent participants recover the same immutable verified binding.
	var wg sync.WaitGroup
	for _, token := range f.tokens[:2] {
		wg.Add(1)
		go func(token string) {
			defer wg.Done()
			code, v := call(t, h, "POST", path, token, map[string]string{"transaction_hash": txhash})
			expect(t, 200, code, v)
		}(token)
	}
	wg.Wait()
	var count int
	f.p.QueryRow(ctx, "SELECT count(*) FROM pactra.onchain_bindings").Scan(&count)
	if count != 1 {
		t.Fatal(count)
	}
	code, v = call(t, h, "GET", "/api/v1/tasks/"+f.id+"/onchain", f.tokens[0], nil)
	expect(t, 200, code, v)
	id, _ := new(big.Int).SetString(v["onchain_task_id"].(string), 10)
	if v["lifecycle"] == nil {
		t.Fatal("missing verified current lifecycle snapshot")
	}
	invoke := func(method, actor, value string, args ...any) {
		t.Helper()
		// Guarded review ABI is mandatory. This fixture explicitly snapshots
		// current evidence before sending; production consent must freeze earlier.
		if method == "acceptDeliverable" || method == "requestRevision" || method == "openDispute" {
			if len(contract.Methods[method].Inputs) != 5 {
				t.Fatal("unguarded review ABI")
			}
			b, err := c.confirmedBlock(ctx)
			if err != nil {
				t.Fatal(err)
			}
			d, err := c.deliverable(ctx, b, args[0].(*big.Int), int(args[1].(*big.Int).Int64()))
			if err != nil || len(d) != 14*32 {
				t.Fatal("fixture review evidence", err)
			}
			args = append(args, new(big.Int).Add(uintWord(d, 4), big.NewInt(1)), toHash(hexData(d[12*32:13*32])), uintWord(d, 5).Uint64())
		}
		data, e := contract.Pack(method, args...)
		if e != nil {
			t.Fatal(e)
		}
		send(actor, c.Escrow, hexData(data), value)
	}
	// Observe each actual lifecycle transition through the HTTP API.
	observe := func(taskState, allocationState, round, event string) {
		t.Helper()
		code, v := call(t, h, "GET", "/api/v1/tasks/"+f.id+"/onchain", f.tokens[0], nil)
		expect(t, 200, code, v)
		life := v["lifecycle"].(map[string]any)
		d := life["allocations"].([]any)[0].(map[string]any)
		if life["task_state"] != taskState || d["state"] != allocationState || d["round"] != round {
			t.Fatal(life)
		}
		found := false
		for _, raw := range life["events"].([]any) {
			ev := raw.(map[string]any)
			if ev["name"] == event && ev["transaction_hash"] != "" {
				found = true
			}
		}
		if !found {
			t.Fatal("missing receipt-linked event", event, life)
		}
	}
	invoke("acceptTask", m.Worker, "", id)
	observe("accepted_unfunded", "awaiting_submission", "1", "WorkerAccepted")
	invoke("fundTask", m.Buyer, "0xf6", id)
	observe("funded", "awaiting_submission", "1", "TaskFunded")
	availabilityPath := f.base + "/onchain/availability"
	payload := map[string]any{"artifact_hash": strings.Repeat("1", 64), "expected_version": 1}
	code, v = call(t, h, "POST", availabilityPath, f.tokens[0], payload)
	expect(t, 403, code, v)
	code, v = call(t, h, "POST", availabilityPath, f.tokens[1], payload)
	expect(t, 409, code, v)
	// APP-01: bind and fund BEFORE the first local submission, with the
	// onchain-enabled handler for POST, persisted buyer GET, and exact replay.
	f.h = h
	empty := f.call(t, "submissions", 0, nil, 200)
	deliveryState(t, empty, "not_submitted", 0)
	firstInput := f.submitInput(0, "")
	snap := f.call(t, "submissions", 1, firstInput, 201)
	firstBlock, e := c.confirmedBlock(ctx)
	if e != nil {
		t.Fatal(e)
	}
	firstNumber, e := quantity(firstBlock.Number)
	if e != nil {
		t.Fatal(e)
	}
	fixture, e := json.Marshal(map[string]any{
		"empty": empty, "post": snap,
		"get":        f.call(t, "submissions", 0, nil, 200),
		"replay":     f.call(t, "submissions", 1, firstInput, 201),
		"block_hash": firstBlock.Hash, "block_number": firstNumber.String(),
	})
	if e != nil {
		t.Fatal(e)
	}
	fixturePath := filepath.Join(t.TempDir(), "delivery-onchain-response.json")
	if e := os.WriteFile(fixturePath, fixture, 0600); e != nil {
		t.Fatal(e)
	}
	parser := exec.Command("node", "--experimental-strip-types", "--test", "--test-name-pattern=APP-01", "tests/delivery-types.test.ts")
	parser.Dir = "../../../frontend"
	parser.Env = append(os.Environ(), "PACTRA_DELIVERY_ONCHAIN_RESPONSE="+fixturePath)
	output, e := parser.CombinedOutput()
	t.Log(string(output))
	if e != nil {
		t.Fatal("enabled backend / actual frontend parser regression", e)
	}
	setAvailabilityTime := func(stamp int64) {
		t.Helper()
		// Move ONLY this ephemeral Anvil and this config's private clock.
		for _, rpc := range []struct {
			method string
			params []any
		}{{"evm_setNextBlockTimestamp", []any{stamp}}, {"evm_mine", []any{}}} {
			body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": rpc.method, "params": rpc.params})
			res, err := http.Post(c.RPCURL, "application/json", bytes.NewReader(body))
			if err != nil {
				t.Fatal(err)
			}
			var out map[string]json.RawMessage
			err = json.NewDecoder(res.Body).Decode(&out)
			res.Body.Close()
			if err != nil || out["error"] != nil {
				t.Fatal("local time control", rpc.method, err, out)
			}
		}
		c.now = func() time.Time { return time.Unix(stamp, 0) }
	}
	if capped {
		setAvailabilityTime(m.DeliveryDeadline.Unix() - 150)
	}
	payload["artifact_hash"] = deliveryHash(snap)
	code, v = call(t, h, "POST", availabilityPath, f.tokens[1], payload)
	expect(t, 200, code, v)
	if capped {
		end := m.DeliveryDeadline.Unix()
		if v["expiry"] != big.NewInt(end-30).String() {
			t.Fatal("initial uncapped expiry", v)
		}
		// Renew an expiring receipt with a strictly later deadline-capped row.
		setAvailabilityTime(end - 60)
		code, v = call(t, h, "POST", availabilityPath, f.tokens[1], payload)
		expect(t, 200, code, v)
		if v["expiry"] != big.NewInt(end).String() {
			t.Fatal("renewal must cap at deadline", v)
		}
		original, _ := json.Marshal(v)
		wrongArtifact := map[string]any{"artifact_hash": strings.Repeat("f", 64), "expected_version": 1}
		code, rejected := call(t, h, "POST", availabilityPath, f.tokens[1], wrongArtifact)
		expect(t, 409, code, rejected)
		code, rejected = call(t, h, "POST", availabilityPath, f.tokens[0], payload)
		expect(t, 403, code, rejected)
		for _, remaining := range []int64{60, 30, 29, 1} {
			if remaining != 60 {
				setAvailabilityTime(end - remaining)
			}
			for i := 0; i < 3; i++ {
				wg.Add(1)
				go func() {
					defer wg.Done()
					code, retry := call(t, h, "POST", availabilityPath, f.tokens[1], payload)
					expect(t, 200, code, retry)
					raw, _ := json.Marshal(retry)
					if !bytes.Equal(original, raw) {
						t.Error("capped retry changed persisted receipt")
					}
				}()
			}
			wg.Wait()
		}
		if err := f.p.QueryRow(ctx, "SELECT count(*) FROM pactra.availability_attestations WHERE task_id=$1 AND round=1", f.id).Scan(&count); err != nil || count != 2 {
			t.Fatal("expected one original and one renewed immutable receipt", count, err)
		}
		// No useful validity remains at equality; fail deliberately, not by PK collision.
		for _, stamp := range []int64{end, end + 1} {
			c.now = func() time.Time { return time.Unix(stamp, 0) }
			code, expired := call(t, h, "POST", availabilityPath, f.tokens[1], payload)
			expect(t, 409, code, expired)
		}
		c.now = func() time.Time { return time.Unix(end-1, 0) }
		t.Log("APP-02: renewal appends once; same-second/concurrent capped retries at 60/30/29/1 seconds return identical receipt; expiry boundary returns 409")
	}
	expiry, _ := new(big.Int).SetString(v["expiry"].(string), 10)
	sig, _ := dataBytes(v["signature"].(string))
	invoke("submitDeliverable", m.Worker, "", id, big.NewInt(0), toHash(deliveryHash(snap)), expiry.Uint64(), sig)
	// Real contract accepted the backend digest/signature. Same round is no longer submittable.
	code, v = call(t, h, "POST", availabilityPath, f.tokens[1], payload)
	expect(t, 409, code, v)
	block, e := c.confirmedBlock(ctx)
	if e != nil {
		t.Fatal(e)
	}
	d, e := c.call(ctx, block, "getDeliverable(uint256,uint256)", word(id), number(0))
	if e != nil || uintWord(d, 3).Int64() != 1 {
		t.Fatal("contract not InReview", e)
	}
	t.Log("real isolated EVM: deployed v2, bound TaskCreated receipt, funded local fixture, accepted backend availability signature and entered InReview")
	if capped {
		t.Log("APP-02: real EVM accepted the reused deadline-capped signature")
		return
	}
	// Revision must persist a new local artifact and match the contract's round.
	invoke("requestRevision", m.Buyer, "", id, big.NewInt(0))
	code, v = call(t, h, "POST", availabilityPath, f.tokens[1], payload)
	expect(t, 409, code, v)
	f.h = h
	// Chain revision authorizes the next submission without fabricating a local
	// buyer review or rewriting the preceding immutable submission.
	snap = f.call(t, "submissions", 1, f.submitInput(1, deliveryHash(snap)), 201)
	if len(snap["reviews"].([]any)) != 0 {
		t.Fatal("invented local review")
	}
	payload["artifact_hash"] = deliveryHash(snap)
	payload["expected_version"] = 2
	for i := 0; i < 3; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			code, v := call(t, h, "POST", availabilityPath, f.tokens[1], payload)
			expect(t, 200, code, v)
		}()
	}
	wg.Wait()
	if e := f.p.QueryRow(ctx, "SELECT count(*) FROM pactra.availability_attestations WHERE round=2").Scan(&count); e != nil || count != 1 {
		t.Fatal("attestation race", count, e)
	}
	// Submit round two and open ONLY an onchain dispute. No local dispute exists.
	code, v = call(t, h, "POST", availabilityPath, f.tokens[1], payload)
	expect(t, 200, code, v)
	expiry, _ = new(big.Int).SetString(v["expiry"].(string), 10)
	sig, _ = dataBytes(v["signature"].(string))
	invoke("submitDeliverable", m.Worker, "", id, big.NewInt(0), toHash(deliveryHash(snap)), expiry.Uint64(), sig)
	observe("funded", "in_review", "2", "EvidenceRecorded")
	sibling := f
	sibling.base = strings.Replace(f.base, "proof-1", "proof-2", 1)
	sibling.call(t, "submissions", 1, sibling.submitInput(0, ""), 201)
	var checkpoint string
	if c.rpc(ctx, "evm_snapshot", []any{}, &checkpoint) != nil {
		t.Fatal("snapshot")
	}
	invoke("openDispute", m.Buyer, "", id, big.NewInt(0))
	observe("funded", "disputed", "2", "DisputeOpened")
	evidencePath := "/api/v1/arbiter/tasks/" + f.id + "/deliverables/proof-1/evidence"
	for _, actor := range []int{2, 3} {
		code, v = call(t, h, "GET", "/api/v1/arbiter/disputes", f.tokens[actor], nil)
		expect(t, 200, code, v)
		cases := v["disputes"].([]any)
		if len(cases) != 1 || cases[0].(map[string]any)["evidence_source"] != "onchain" {
			t.Fatal(v)
		}
		code, v = call(t, h, "GET", evidencePath, f.tokens[actor], nil)
		expect(t, 200, code, v)
		if len(v["onchain"].(map[string]any)["allocations"].([]any)) != 1 || len(v["delivery"].(map[string]any)["disputes"].([]any)) != 0 {
			t.Fatal("scope or fabricated dispute", v)
		}
		code, v = call(t, h, "GET", strings.Replace(evidencePath, "proof-1", "proof-2", 1), f.tokens[actor], nil)
		expect(t, 404, code, v)
		code, v = call(t, h, "GET", f.base+"/submissions", f.tokens[actor], nil)
		expect(t, 404, code, v)
	}
	code, v = call(t, h, "GET", evidencePath, f.tokens[4], nil)
	expect(t, 404, code, v)
	// A real local reorg preserves creation but removes the current dispute.
	disputedBlock, e := c.confirmedBlock(ctx)
	if e != nil {
		t.Fatal(e)
	}
	var reverted bool
	if c.rpc(ctx, "evm_revert", []any{checkpoint}, &reverted) != nil || !reverted {
		t.Fatal("revert")
	}
	if c.canonical(ctx, disputedBlock) == nil {
		t.Fatal("removed current block accepted")
	}
	code, v = call(t, h, "GET", evidencePath, f.tokens[2], nil)
	expect(t, 404, code, v)
	code, v = call(t, h, "GET", "/api/v1/arbiter/disputes", f.tokens[2], nil)
	expect(t, 200, code, v)
	if len(v["disputes"].([]any)) != 0 {
		t.Fatal("reorg left stale case", v)
	}
	invoke("openDispute", m.Buyer, "", id, big.NewInt(0))
	// Candidate pagination: a nondisputed sibling cannot appear as a case.
	code, v = call(t, h, "GET", "/api/v1/arbiter/disputes?limit=1", f.tokens[2], nil)
	expect(t, 200, code, v)
	if len(v["disputes"].([]any)) != 1 || v["next_cursor"] == nil {
		t.Fatal(v)
	}
	code, v = call(t, h, "GET", "/api/v1/arbiter/disputes?limit=1&cursor="+v["next_cursor"].(string), f.tokens[2], nil)
	expect(t, 200, code, v)
	if len(v["disputes"].([]any)) != 0 || v["next_cursor"] != nil {
		t.Fatal(v)
	}
	code, v = call(t, h, "POST", path, f.tokens[0], map[string]any{})
	expect(t, 200, code, v)
	life := v["lifecycle"].(map[string]any)
	lastEvent := life["events"].([]any)[len(life["events"].([]any))-1].(map[string]any)
	code, v = call(t, h, "POST", path, f.tokens[0], map[string]any{"transaction_hash": lastEvent["transaction_hash"]})
	expect(t, 200, code, v)
	code, v = call(t, h, "POST", path, f.tokens[0], map[string]any{"transaction_hash": "0x" + strings.Repeat("1", 64)})
	expect(t, 409, code, v)
	// Record handover after the primary window. No automatic timer authority.
	var timeResult any
	if c.rpc(ctx, "evm_increaseTime", []any{172801}, &timeResult) != nil {
		t.Fatal("time travel")
	}
	invoke("handoverDispute", m.Buyer, "", id, big.NewInt(0))
	observe("funded", "disputed", "2", "DisputeHandover")
	invoke("resolveDispute", m.BackupArbiter, "", id, big.NewInt(0), big.NewInt(70))
	observe("funded", "settled", "2", "DisputeResolved")
	code, v = call(t, h, "GET", evidencePath, f.tokens[2], nil)
	expect(t, 404, code, v)
	code, v = call(t, h, "GET", "/api/v1/arbiter/disputes", f.tokens[2], nil)
	expect(t, 200, code, v)
	if len(v["disputes"].([]any)) != 0 {
		t.Fatal("resolved chain-only case still active", v)
	}
	// Never-submitted sibling refunds only after its immutable deadline.
	if c.rpc(ctx, "evm_increaseTime", []any{int64(30 * 24 * 3600)}, &timeResult) != nil {
		t.Fatal("deadline time travel")
	}
	invoke("refundUnsubmitted", m.Buyer, "", id, big.NewInt(1))
	observe("completed", "settled", "2", "UnsubmittedRefunded")
	invoke("withdraw", m.Worker, "")
	observe("completed", "settled", "2", "TaskCompleted")
	t.Log("real EVM lifecycle: funding, two submissions, chain-only revision, scoped primary/backup dispute, handover, split resolution, sibling refund and completion verified")
	// Append-only guards and private table ACLs are exercised in the isolated DB.
	for _, table := range []string{"onchain_bindings", "availability_attestations"} {
		if _, e := f.p.Exec(ctx, "DELETE FROM pactra."+table); e == nil {
			t.Fatal("mutable evidence", table)
		}
		if _, e := f.p.Exec(ctx, "TRUNCATE pactra."+table+" CASCADE"); e == nil {
			t.Fatal("truncatable evidence", table)
		}
	}
	// Removing local chain history invalidates a previously persisted binding;
	// GET re-verifies rather than serving client-controlled/stale finality.
	resetBody := []byte(`{"jsonrpc":"2.0","id":1,"method":"anvil_reset","params":[]}`)
	reset, e := http.Post(c.RPCURL, "application/json", bytes.NewReader(resetBody))
	if e != nil {
		t.Fatal(e)
	}
	reset.Body.Close()
	code, v = call(t, h, "GET", "/api/v1/tasks/"+f.id+"/onchain", f.tokens[0], nil)
	expect(t, 503, code, v)
	var public bool
	if e := f.p.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl WHERE n.nspname='pactra' AND c.relname IN ('onchain_bindings','availability_attestations') AND acl.grantee=0)`).Scan(&public); e != nil || public {
		t.Fatal("public privileges", e)
	}
}
