// Package workspace implements the persistent, unfunded task workspace.
package workspace

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"math/big"
)

type Config struct {
	Domain, URI string
	ChainID     int64
	Arbiters    []string
}
type server struct {
	pool     *pgxpool.Pool
	cfg      Config
	arbiters map[string]bool
}

var globalChallenges struct {
	sync.Mutex
	start time.Time
	count int
}
var addressRE = regexp.MustCompile(`^0x[0-9a-fA-F]{40}$`)
var uuidRE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)

func address(s string) (string, error) {
	if !addressRE.MatchString(s) || common.HexToAddress(s) == (common.Address{}) {
		return "", errors.New("invalid address")
	}
	return strings.ToLower(s), nil
}
func New(pool *pgxpool.Pool, c Config) (http.Handler, error) {
	u, e := url.Parse(c.URI)
	if pool == nil || e != nil || c.ChainID <= 0 || c.Domain == "" || strings.ContainsAny(c.Domain, "\r\n /?#@") || u.Host != c.Domain || u.Hostname() == "" || u.User != nil || u.Fragment != "" || u.Opaque != "" || (u.Scheme != "https" && (u.Scheme != "http" || u.Hostname() != "localhost")) {
		return nil, errors.New("invalid workspace configuration")
	}
	s := &server{pool: pool, cfg: c, arbiters: map[string]bool{}}
	for _, a := range c.Arbiters {
		a, e = address(a)
		if e != nil {
			return nil, e
		}
		s.arbiters[a] = true
	}
	m := http.NewServeMux()
	m.HandleFunc("POST /api/v1/auth/challenge", s.challenge)
	m.HandleFunc("POST /api/v1/auth/verify", s.verify)
	m.HandleFunc("GET /api/v1/me", s.auth(s.me))
	m.HandleFunc("POST /api/v1/auth/logout", s.auth(s.logout))
	m.HandleFunc("POST /api/v1/tasks", s.auth(s.create))
	m.HandleFunc("GET /api/v1/tasks", s.auth(s.list))
	m.HandleFunc("GET /api/v1/tasks/{id}", s.auth(s.get))
	m.HandleFunc("POST /api/v1/tasks/{id}/accept", s.auth(s.accept))
	m.HandleFunc("POST /api/v1/tasks/{id}/cancel", s.auth(s.cancel))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		w.Header().Set("Cache-Control", "no-store")
		m.ServeHTTP(w, r.WithContext(ctx))
	}), nil
}
func respond(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int) {
	respond(w, status, map[string]string{"error": http.StatusText(status)})
}
func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	b, err := io.ReadAll(r.Body)
	if err != nil || !validJSONUnicode(b) || len(strings.TrimSpace(string(b))) == 0 || strings.TrimSpace(string(b))[0] != '{' {
		fail(w, 400)
		return false
	}
	check := json.NewDecoder(strings.NewReader(string(b)))
	check.UseNumber()
	if strictValue(check, 0, reflect.TypeOf(v).Elem()) != nil {
		fail(w, 400)
		return false
	}
	if _, err = check.Token(); err != io.EOF {
		fail(w, 400)
		return false
	}
	d := json.NewDecoder(strings.NewReader(string(b)))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		fail(w, 400)
		return false
	}
	return true
}

// Reject duplicate keys and null at every depth rather than letting Go's decoder
// silently accept last-key-wins or coerce null into a zero-value string.
func strictValue(d *json.Decoder, depth int, typ reflect.Type) error {
	if depth > 32 {
		return errors.New("JSON too deep")
	}
	t, err := d.Token()
	if err != nil {
		return err
	}
	if t == nil {
		return errors.New("null not allowed")
	}
	switch t {
	case json.Delim('{'):
		seen := map[string]bool{}
		for d.More() {
			k, err := d.Token()
			if err != nil {
				return err
			}
			key, ok := k.(string)
			if !ok || seen[key] {
				return errors.New("duplicate key")
			}
			seen[key] = true
			var child reflect.Type
			if typ != nil && typ.Kind() == reflect.Struct {
				for i := 0; i < typ.NumField(); i++ {
					f := typ.Field(i)
					if strings.Split(f.Tag.Get("json"), ",")[0] == key {
						child = f.Type
						break
					}
				}
				if child == nil {
					return errors.New("unknown field")
				}
			} else if typ != nil && typ.Kind() == reflect.Map {
				child = typ.Elem()
			}
			if err := strictValue(d, depth+1, child); err != nil {
				return err
			}
		}
		end, err := d.Token()
		if err != nil {
			return err
		}
		if end != json.Delim('}') {
			return errors.New("invalid object")
		}
	case json.Delim('['):
		var child reflect.Type
		if typ != nil && (typ.Kind() == reflect.Slice || typ.Kind() == reflect.Array) {
			child = typ.Elem()
		}
		for d.More() {
			if err := strictValue(d, depth+1, child); err != nil {
				return err
			}
		}
		end, err := d.Token()
		if err != nil {
			return err
		}
		if end != json.Delim(']') {
			return errors.New("invalid array")
		}
	}
	return nil
}
func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	return hex.EncodeToString(b), nil
}
func uuid() (string, error) {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	b[6] = (b[6] & 15) | 64
	b[8] = (b[8] & 63) | 128
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[:4], b[4:6], b[6:8], b[8:10], b[10:]), nil
}
func (s *server) challenge(w http.ResponseWriter, r *http.Request) {
	if !challengeClients.allow(r.RemoteAddr, time.Now()) {
		fail(w, 429)
		return
	}
	var in struct {
		Address string `json:"address"`
	}
	if !decode(w, r, &in) {
		return
	}
	a, e := address(in.Address)
	if e != nil {
		fail(w, 400)
		return
	}
	now := time.Now().UTC()
	tx, e := s.pool.Begin(r.Context())
	if e != nil {
		fail(w, 503)
		return
	}
	defer tx.Rollback(r.Context())
	if _, e = tx.Exec(r.Context(), "INSERT INTO proofpay.accounts(address) VALUES($1) ON CONFLICT DO NOTHING", a); e != nil {
		fail(w, 503)
		return
	}
	// UPSERT obtains a row lock, serializing limits across processes.
	var count int
	e = tx.QueryRow(r.Context(), `INSERT INTO proofpay.challenge_limits(address,window_start,count) VALUES($1,clock_timestamp(),1) ON CONFLICT(address) DO UPDATE SET window_start=CASE WHEN proofpay.challenge_limits.window_start<=clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE proofpay.challenge_limits.window_start END,count=CASE WHEN proofpay.challenge_limits.window_start<=clock_timestamp()-interval '1 minute' THEN 1 ELSE proofpay.challenge_limits.count+1 END WHERE proofpay.challenge_limits.window_start<=clock_timestamp()-interval '1 minute' OR proofpay.challenge_limits.count<5 RETURNING count`, a).Scan(&count)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 429)
		return
	}
	if e != nil {
		fail(w, 503)
		return
	}
	id, e := uuid()
	if e != nil {
		fail(w, 503)
		return
	}
	nonce, e := randomHex(16)
	if e != nil {
		fail(w, 503)
		return
	}
	now = now.Truncate(time.Second)
	expiry := now.Add(5 * time.Minute)
	message := fmt.Sprintf("%s wants you to sign in with your Ethereum account:\n%s\n\nSign in to ProofPay.\n\nURI: %s\nVersion: 1\nChain ID: %d\nNonce: %s\nIssued At: %s\nExpiration Time: %s", s.cfg.Domain, common.HexToAddress(a).Hex(), s.cfg.URI, s.cfg.ChainID, nonce, now.Format(time.RFC3339), expiry.Format(time.RFC3339))
	if _, e = tx.Exec(r.Context(), "INSERT INTO proofpay.challenges(id,address,message,expires_at) VALUES($1,$2,$3,$4)", id, a, message, expiry); e != nil {
		fail(w, 503)
		return
	}
	// Serialize admission through commit: rejected/rolled-back transactions do
	// not spend the process-wide successful issuance quota.
	globalChallenges.Lock()
	defer globalChallenges.Unlock()
	if stamp := time.Now(); stamp.Sub(globalChallenges.start) >= time.Minute {
		globalChallenges.start = stamp
		globalChallenges.count = 0
	}
	if globalChallenges.count >= 60 {
		fail(w, 429)
		return
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	globalChallenges.count++
	respond(w, 201, map[string]any{"challenge_id": id, "message": message, "expires_at": expiry})
}
func (s *server) verify(w http.ResponseWriter, r *http.Request) {
	var in struct {
		ChallengeID string `json:"challenge_id"`
		Signature   string `json:"signature"`
	}
	if !decode(w, r, &in) {
		return
	}
	if !uuidRE.MatchString(in.ChallengeID) || len(in.Signature) != 132 || !strings.HasPrefix(in.Signature, "0x") {
		fail(w, 401)
		return
	}
	sig, e := hex.DecodeString(in.Signature[2:])
	if e != nil {
		fail(w, 401)
		return
	}
	if sig[64] == 27 || sig[64] == 28 {
		sig[64] -= 27
	}
	if !crypto.ValidateSignatureValues(sig[64], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:64]), true) {
		fail(w, 401)
		return
	}
	tx, e := s.pool.Begin(r.Context())
	if e != nil {
		fail(w, 503)
		return
	}
	defer tx.Rollback(r.Context())
	var a, msg string
	e = tx.QueryRow(r.Context(), "SELECT address,message FROM proofpay.challenges WHERE id=$1 AND NOT consumed AND expires_at>clock_timestamp() FOR UPDATE", in.ChallengeID).Scan(&a, &msg)
	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 401)
		return
	}
	if e != nil {
		fail(w, 503)
		return
	}
	// Recheck the relying-party binding against this server's configuration,
	// not merely the persisted message (which could come from another deployment).
	if !strings.HasPrefix(msg, s.cfg.Domain+" wants you to sign in with your Ethereum account:\n") || !strings.Contains(msg, fmt.Sprintf("\nURI: %s\nVersion: 1\nChain ID: %d\n", s.cfg.URI, s.cfg.ChainID)) {
		fail(w, 401)
		return
	}
	pub, e := crypto.SigToPub(accounts.TextHash([]byte(msg)), sig)
	if e != nil || strings.ToLower(crypto.PubkeyToAddress(*pub).Hex()) != a {
		fail(w, 401)
		return
	}
	token, e := randomHex(32)
	if e != nil {
		fail(w, 503)
		return
	}
	hash := sha256.Sum256([]byte(token))
	expiry := time.Now().UTC().Add(24 * time.Hour)
	result, e := tx.Exec(r.Context(), "UPDATE proofpay.challenges SET consumed=true WHERE id=$1 AND NOT consumed AND expires_at>clock_timestamp()", in.ChallengeID)
	if e != nil {
		fail(w, 503)
		return
	}
	if result.RowsAffected() != 1 {
		fail(w, 401)
		return
	}
	if _, e = tx.Exec(r.Context(), "INSERT INTO proofpay.sessions(token_hash,address,expires_at,audience) VALUES($1,$2,$3,$4)", hash[:], a, expiry, s.audience()); e != nil {
		fail(w, 503)
		return
	}
	if tx.Commit(r.Context()) != nil {
		fail(w, 503)
		return
	}
	respond(w, 200, map[string]any{"token": token, "token_type": "Bearer", "expires_at": expiry, "address": a})
}

type authed func(http.ResponseWriter, *http.Request, string)

func bearer(r *http.Request) string {
	v := r.Header.Get("Authorization")
	if !strings.HasPrefix(v, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(v, "Bearer ")
}
func (s *server) auth(next authed) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := bearer(r)
		if len(token) != 64 {
			fail(w, 401)
			return
		}
		hash := sha256.Sum256([]byte(token))
		var a string
		e := s.pool.QueryRow(r.Context(), "SELECT address FROM proofpay.sessions WHERE token_hash=$1 AND audience=$2 AND expires_at>clock_timestamp()", hash[:], s.audience()).Scan(&a)
		if errors.Is(e, pgx.ErrNoRows) {
			fail(w, 401)
			return
		}
		if e != nil {
			fail(w, 503)
			return
		}
		next(w, r, a)
	}
}
func (s *server) me(w http.ResponseWriter, r *http.Request, a string) {
	respond(w, 200, map[string]string{"address": a})
}
func (s *server) logout(w http.ResponseWriter, r *http.Request, a string) {
	var in struct{}
	if !decode(w, r, &in) {
		return
	}
	h := sha256.Sum256([]byte(bearer(r)))
	if _, e := s.pool.Exec(r.Context(), "DELETE FROM proofpay.sessions WHERE token_hash=$1 AND audience=$2", h[:], s.audience()); e != nil {
		fail(w, 503)
		return
	}
	w.WriteHeader(204)
}
