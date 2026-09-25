package workspace

// Read-only JSON-RPC adapter. No sendTransaction/sendRawTransaction method exists.
import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

var errChain = errors.New("chain verification unavailable or inconsistent")
var chainHashRE = regexp.MustCompile(`^0x[0-9a-fA-F]{64}$`)
var quantityRE = regexp.MustCompile(`^0x(?:0|[1-9a-f][0-9a-f]*)$`)

type OnchainConfig struct {
	RPCURL        string
	ChainID       int64
	Escrow        string
	Confirmations uint64
	key           *ecdsa.PrivateKey
	// Optional package-private clock for deterministic availability expiry tests.
	// Runtime configuration leaves this nil and uses the wall clock.
	now func() time.Time
}

func LoadOnchainConfig(get func(string) string, chain int64) (*OnchainConfig, error) {
	enabled := get("PACTRA_ONCHAIN_ENABLED")
	if enabled == "" || enabled == "false" {
		return nil, nil
	}
	if enabled != "true" || chain <= 0 {
		return nil, errChain
	}
	u, e := url.Parse(get("PACTRA_ONCHAIN_RPC_URL"))
	if e != nil || u.Host == "" || u.Fragment != "" || u.User != nil || (u.Scheme != "https" && !(u.Scheme == "http" && (u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1" || u.Hostname() == "::1"))) {
		return nil, errChain
	}
	a, e := address(get("PACTRA_ONCHAIN_ESCROW"))
	if e != nil {
		return nil, errChain
	}
	confirmations, e := strconv.ParseUint(get("PACTRA_ONCHAIN_CONFIRMATIONS"), 10, 64)
	if e != nil || confirmations < 1 || confirmations > 256 {
		return nil, errChain
	}
	c := &OnchainConfig{RPCURL: u.String(), ChainID: chain, Escrow: a, Confirmations: confirmations}
	if path := get("PACTRA_ONCHAIN_ATTESTOR_KEY_FILE"); path != "" {
		st, e := os.Lstat(path)
		if e != nil || !st.Mode().IsRegular() || st.Mode().Perm()&0077 != 0 || st.Size() > 256 {
			return nil, errChain
		}
		b, e := os.ReadFile(path)
		if e != nil {
			return nil, errChain
		}
		k, e := crypto.HexToECDSA(strings.TrimSpace(string(b)))
		for i := range b {
			b[i] = 0
		}
		if e != nil {
			return nil, errChain
		}
		c.key = k
	}
	return c, nil
}
func (c *OnchainConfig) rpc(ctx context.Context, method string, params any, out any) error {
	b, e := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
	if e != nil {
		return errChain
	}
	req, e := http.NewRequestWithContext(ctx, "POST", c.RPCURL, bytes.NewReader(b))
	if e != nil {
		return errChain
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 4 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return errChain }}
	res, e := client.Do(req)
	if e != nil {
		return errChain
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		return errChain
	}
	raw, e := io.ReadAll(io.LimitReader(res.Body, 2<<20))
	if e != nil || len(raw) >= 2<<20 {
		return errChain
	}
	var envelope struct {
		Version string          `json:"jsonrpc"`
		ID      int             `json:"id"`
		Result  json.RawMessage `json:"result"`
		Error   json.RawMessage `json:"error"`
	}
	if json.Unmarshal(raw, &envelope) != nil || envelope.Version != "2.0" || envelope.ID != 1 || len(envelope.Error) > 0 || len(envelope.Result) == 0 || string(envelope.Result) == "null" || json.Unmarshal(envelope.Result, out) != nil {
		return errChain
	}
	return nil
}
func quantity(s string) (*big.Int, error) {
	if !quantityRE.MatchString(s) {
		return nil, errChain
	}
	n, ok := new(big.Int).SetString(s[2:], 16)
	if !ok || n.BitLen() > 256 {
		return nil, errChain
	}
	return n, nil
}
func dataBytes(s string) ([]byte, error) {
	if !strings.HasPrefix(s, "0x") || len(s)%2 != 0 {
		return nil, errChain
	}
	b, e := hex.DecodeString(s[2:])
	if e != nil {
		return nil, errChain
	}
	return b, nil
}
func word(n *big.Int) []byte            { return common.LeftPadBytes(n.Bytes(), 32) }
func number(n int64) []byte             { return word(big.NewInt(n)) }
func addrWord(a string) []byte          { return common.LeftPadBytes(common.HexToAddress(a).Bytes(), 32) }
func hashWord(s string) []byte          { return common.HexToHash(s).Bytes() }
func joined(parts ...[]byte) []byte     { return bytes.Join(parts, nil) }
func hash(parts ...[]byte) []byte       { return crypto.Keccak256(joined(parts...)) }
func hexData(b []byte) string           { return "0x" + hex.EncodeToString(b) }
func uintWord(b []byte, i int) *big.Int { return new(big.Int).SetBytes(b[i*32 : (i+1)*32]) }
func wordAddress(b []byte, i int) string {
	return strings.ToLower(common.BytesToAddress(b[i*32 : (i+1)*32]).Hex())
}
func (c *OnchainConfig) domain() []byte {
	return hash(hash([]byte("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")), hash([]byte("PactraEscrow")), hash([]byte("2")), number(c.ChainID), addrWord(c.Escrow))
}
func (c *OnchainConfig) typed(b []byte) []byte { return hash([]byte{0x19, 0x01}, c.domain(), b) }
func (c *OnchainConfig) manifestDigest(m Manifest, content, attestor string) ([]byte, error) {
	if m.ChainID != c.ChainID || m.Version < 1 || !deliveryHashRE.MatchString(content) || m.DeliveryDeadline.Unix() <= 0 || m.DeliveryDeadline.Nanosecond() != 0 || m.PrimaryArbiterHours != 48 || m.BackupArbiterHours != 48 || len(m.Deliverables) < 1 || len(m.Deliverables) > 50 {
		return nil, errChain
	}
	configs := joined(number(32), number(int64(len(m.Deliverables))))
	for _, d := range m.Deliverables {
		n, ok := new(big.Int).SetString(d.Amount, 10)
		if !ok || n.Sign() <= 0 || n.BitLen() > 128 || d.RevisionLimit < 0 || d.RevisionLimit > 5 || d.ReviewPeriodHours < 24 || d.ReviewPeriodHours > 168 {
			return nil, errChain
		}
		configs = append(configs, joined(word(n), number(int64(d.RevisionLimit)), number(int64(d.ReviewPeriodHours)*3600), number(m.DeliveryDeadline.Unix()))...)
	}
	typ := "Manifest(address buyer,address worker,address arbiter,address backupArbiter,address evidenceAttestor,uint256 arbiterWindow,uint256 maxDeliverables,uint256 chainId,uint64 version,bytes32 contentHash,bytes32 configsHash)"
	return c.typed(hash(hash([]byte(typ)), addrWord(m.Buyer), addrWord(m.Worker), addrWord(m.PrimaryArbiter), addrWord(m.BackupArbiter), addrWord(attestor), number(48*3600), number(50), number(c.ChainID), number(int64(m.Version)), hashWord(content), hash(configs))), nil
}
func (c *OnchainConfig) submissionDigest(task, index, round *big.Int, manifest, artifact string, expiry uint64) []byte {
	return c.typed(hash(hash([]byte("Submission(uint256 taskId,uint256 index,uint256 round,bytes32 manifestHash,bytes32 artifactHash,uint64 expiry)")), word(task), word(index), word(round), hashWord(manifest), hashWord(artifact), word(new(big.Int).SetUint64(expiry))))
}

type chainBlock struct {
	Number    string `json:"number"`
	Hash      string `json:"hash"`
	Timestamp string `json:"timestamp"`
}
type chainLog struct {
	LogIndex        string   `json:"logIndex"`
	Address         string   `json:"address"`
	Topics          []string `json:"topics"`
	Data            string   `json:"data"`
	Removed         bool     `json:"removed"`
	BlockHash       string   `json:"blockHash"`
	TransactionHash string   `json:"transactionHash"`
	BlockNumber     string   `json:"blockNumber"`
}
type chainReceipt struct {
	TransactionHash string     `json:"transactionHash"`
	BlockHash       string     `json:"blockHash"`
	BlockNumber     string     `json:"blockNumber"`
	Status          string     `json:"status"`
	To              string     `json:"to"`
	Logs            []chainLog `json:"logs"`
}
type chainProof struct {
	TaskID          string `json:"task_id"`
	ChainID         string `json:"chain_id"`
	Escrow          string `json:"escrow_address"`
	OnchainTaskID   string `json:"onchain_task_id"`
	TransactionHash string `json:"transaction_hash"`
	BlockNumber     string `json:"block_number"`
	BlockHash       string `json:"block_hash"`
	ManifestDigest  string `json:"manifest_digest"`
}

func (c *OnchainConfig) Validate(ctx context.Context) error {
	if c == nil {
		return nil
	}
	if c.ChainID <= 0 || c.Confirmations < 1 || c.Confirmations > 256 {
		return errChain
	}
	if _, e := address(c.Escrow); e != nil {
		return errChain
	}
	block, e := c.confirmedBlock(ctx)
	if e != nil {
		return errChain
	}
	if _, e = c.deployment(ctx, block); e != nil {
		return errChain
	}
	return c.canonical(ctx, block)
}

func (c *OnchainConfig) checkChain(ctx context.Context) error {
	var q string
	if c.rpc(ctx, "eth_chainId", []any{}, &q) != nil {
		return errChain
	}
	n, e := quantity(q)
	if e != nil || n.Cmp(big.NewInt(c.ChainID)) != 0 {
		return errChain
	}
	return nil
}
func (c *OnchainConfig) call(ctx context.Context, b chainBlock, signature string, args ...[]byte) ([]byte, error) {
	data := append(crypto.Keccak256([]byte(signature))[:4], joined(args...)...)
	var result string
	if c.rpc(ctx, "eth_call", []any{map[string]string{"to": c.Escrow, "data": hexData(data)}, map[string]any{"blockHash": b.Hash, "requireCanonical": true}}, &result) != nil {
		return nil, errChain
	}
	return dataBytes(result)
}
func (c *OnchainConfig) canonical(ctx context.Context, b chainBlock) error {
	var check chainBlock
	if c.rpc(ctx, "eth_getBlockByNumber", []any{b.Number, false}, &check) != nil || !chainHashRE.MatchString(b.Hash) || check.Hash != b.Hash || check.Number != b.Number {
		return errChain
	}
	return nil
}
func (c *OnchainConfig) deployment(ctx context.Context, b chainBlock) (string, error) {
	var code string
	if c.rpc(ctx, "eth_getCode", []any{c.Escrow, map[string]any{"blockHash": b.Hash, "requireCanonical": true}}, &code) != nil {
		return "", errChain
	}
	codeBytes, e := dataBytes(code)
	if e != nil || len(codeBytes) == 0 {
		return "", errChain
	}
	a, e := c.call(ctx, b, "evidenceAttestor()")
	if e != nil || len(a) != 32 || bytes.Equal(a, make([]byte, 32)) {
		return "", errChain
	}
	attestor := wordAddress(a, 0)
	if c.key != nil && !strings.EqualFold(attestor, crypto.PubkeyToAddress(c.key.PublicKey).Hex()) {
		return "", errChain
	}
	domain, e := c.call(ctx, b, "domainSeparator()")
	if e != nil || !bytes.Equal(domain, c.domain()) {
		return "", errChain
	}
	return attestor, nil
}
func (c *OnchainConfig) confirmedBlock(ctx context.Context) (chainBlock, error) {
	var b chainBlock
	if c.checkChain(ctx) != nil {
		return b, errChain
	}
	var latest string
	if c.rpc(ctx, "eth_blockNumber", []any{}, &latest) != nil {
		return b, errChain
	}
	n, e := quantity(latest)
	if e != nil || !n.IsUint64() || n.Uint64()+1 < c.Confirmations {
		return b, errChain
	}
	n.Sub(n, new(big.Int).SetUint64(c.Confirmations-1))
	q := "0x" + n.Text(16)
	if c.rpc(ctx, "eth_getBlockByNumber", []any{q, false}, &b) != nil || b.Number != q || !chainHashRE.MatchString(b.Hash) {
		return b, errChain
	}
	return b, nil
}
func (c *OnchainConfig) deliverable(ctx context.Context, b chainBlock, id *big.Int, index int) ([]byte, error) {
	d, e := c.call(ctx, b, "getDeliverable(uint256,uint256)", word(id), number(int64(index)))
	if e != nil || len(d) != 10*32 {
		return nil, errChain
	}
	evidence, e := c.call(ctx, b, "getDeliveryEvidence(uint256,uint256)", word(id), number(int64(index)))
	if e != nil || len(evidence) != 4*32 {
		return nil, errChain
	}
	return append(d, evidence...), nil
}

func (c *OnchainConfig) verifyTask(ctx context.Context, b chainBlock, id *big.Int, m Manifest, content string) ([]byte, error) {
	count, e := c.call(ctx, b, "taskCount()")
	if e != nil || len(count) != 32 || id.Sign() <= 0 || id.Cmp(uintWord(count, 0)) > 0 {
		return nil, errChain
	}
	attestor, e := c.deployment(ctx, b)
	if e != nil {
		return nil, e
	}
	digest, e := c.manifestDigest(m, content, attestor)
	if e != nil {
		return nil, e
	}
	task, e := c.call(ctx, b, "getTask(uint256)", word(id))
	if e != nil || len(task) != 9*32 {
		return nil, errChain
	}
	identity, e := c.call(ctx, b, "getTaskManifest(uint256)", word(id))
	if e != nil || len(identity) != 2*32 {
		return nil, errChain
	}
	task = append(task, identity...)
	if len(task) != 11*32 {
		return nil, errChain
	}
	if wordAddress(task, 0) != m.Buyer || wordAddress(task, 1) != m.Worker || wordAddress(task, 2) != m.PrimaryArbiter || wordAddress(task, 3) != m.BackupArbiter || !bytes.Equal(task[128:160], digest) || uintWord(task, 5).Cmp(big.NewInt(c.ChainID)) != 0 || uintWord(task, 7).Cmp(big.NewInt(int64(len(m.Deliverables)))) != 0 || uintWord(task, 9).Cmp(big.NewInt(int64(m.Version))) != 0 || !bytes.Equal(task[320:352], hashWord(content)) {
		return nil, errChain
	}
	for i, d := range m.Deliverables {
		got, e := c.deliverable(ctx, b, id, i)
		if e != nil || len(got) != 14*32 {
			return nil, errChain
		}
		amount, _ := new(big.Int).SetString(d.Amount, 10)
		if uintWord(got, 0).Cmp(amount) != 0 || uintWord(got, 1).Cmp(big.NewInt(int64(d.RevisionLimit))) != 0 || uintWord(got, 2).Cmp(big.NewInt(int64(d.ReviewPeriodHours)*3600)) != 0 || uintWord(got, 10).Cmp(big.NewInt(m.DeliveryDeadline.Unix())) != 0 {
			return nil, errChain
		}
	}
	return task, nil
}
func (c *OnchainConfig) verifyCreation(ctx context.Context, txhash string, m Manifest, content string) (chainProof, error) {
	var proof chainProof
	if !chainHashRE.MatchString(txhash) || c.checkChain(ctx) != nil {
		return proof, errChain
	}
	var receipt chainReceipt
	if c.rpc(ctx, "eth_getTransactionReceipt", []any{txhash}, &receipt) != nil || !strings.EqualFold(receipt.TransactionHash, txhash) || receipt.Status != "0x1" || !strings.EqualFold(receipt.To, c.Escrow) || !chainHashRE.MatchString(receipt.BlockHash) {
		return proof, errChain
	}
	n, e := quantity(receipt.BlockNumber)
	if e != nil {
		return proof, errChain
	}
	tip, e := c.confirmedBlock(ctx)
	if e != nil {
		return proof, e
	}
	tipN, _ := quantity(tip.Number)
	if tipN.Cmp(n) < 0 {
		return proof, errChain
	}
	b := chainBlock{Number: receipt.BlockNumber, Hash: receipt.BlockHash}
	if c.canonical(ctx, b) != nil {
		return proof, errChain
	}
	topic := hexData(hash([]byte("TaskCreated(uint256,address,address,address,address,bytes32,uint256,uint256)")))
	var id *big.Int
	var event []byte
	for _, l := range receipt.Logs {
		if !strings.EqualFold(l.Address, c.Escrow) || len(l.Topics) == 0 || l.Topics[0] != topic {
			continue
		}
		if id != nil || len(l.Topics) != 3 || !chainHashRE.MatchString(l.Topics[1]) || !chainHashRE.MatchString(l.Topics[2]) || l.Removed || l.BlockHash != receipt.BlockHash || l.BlockNumber != receipt.BlockNumber || !strings.EqualFold(l.TransactionHash, txhash) {
			return proof, errChain
		}
		event, e = dataBytes(l.Data)
		if e != nil || len(event) != 6*32 || !bytes.Equal(hashWord(l.Topics[2]), addrWord(m.Buyer)) {
			return proof, errChain
		}
		id = new(big.Int).SetBytes(hashWord(l.Topics[1]))
	}
	if id == nil {
		return proof, errChain
	}
	task, e := c.verifyTask(ctx, b, id, m, content)
	if e != nil {
		return proof, e
	}
	if !bytes.Equal(event, joined(task[32:128], task[128:192], task[224:256])) {
		return proof, errChain
	}
	if c.canonical(ctx, b) != nil || c.canonical(ctx, tip) != nil {
		return proof, errChain
	}
	proof = chainProof{ChainID: strconv.FormatInt(c.ChainID, 10), Escrow: c.Escrow, OnchainTaskID: id.String(), TransactionHash: strings.ToLower(txhash), BlockNumber: n.String(), BlockHash: b.Hash, ManifestDigest: hexData(task[128:160])}
	return proof, nil
}
