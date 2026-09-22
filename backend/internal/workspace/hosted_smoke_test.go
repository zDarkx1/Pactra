package workspace_test

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/ethereum/go-ethereum/accounts"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"net/http/httptest"
	"os"
	"proofpay/backend/internal/workspace"
	"testing"
	"time"
)

// Explicit opt-in only. Never uses TEST_DATABASE_URL and never applies/drops schema.
// Uses ephemeral no-funds test wallets and removes only those fixture rows.
func TestHostedWorkspaceSmoke(t *testing.T) {
	dsn := os.Getenv("PROOFPAY_LIVE_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("explicit hosted smoke opt-in required")
	}
	ctx := context.Background()
	p, e := pgxpool.New(ctx, dsn)
	if e != nil {
		t.Fatal(e)
	}
	defer p.Close()
	keys := make([]*ecdsa.PrivateKey, 4)
	addresses := make([]string, 4)
	for i := range keys {
		keys[i], e = crypto.GenerateKey()
		if e != nil {
			t.Fatal(e)
		}
		addresses[i] = crypto.PubkeyToAddress(keys[i].PublicKey).Hex()
	}
	defer func() {
		for _, a := range addresses {
			for _, q := range []string{"DELETE FROM proofpay.tasks WHERE buyer=lower($1)", "DELETE FROM proofpay.sessions WHERE address=lower($1)", "DELETE FROM proofpay.challenges WHERE address=lower($1)", "DELETE FROM proofpay.challenge_limits WHERE address=lower($1)"} {
				if _, err := p.Exec(ctx, q, a); err != nil {
					t.Errorf("fixture cleanup failed")
				}
			}
		}
		for _, a := range addresses {
			if _, err := p.Exec(ctx, "DELETE FROM proofpay.accounts WHERE address=lower($1)", a); err != nil {
				t.Errorf("account cleanup failed")
			}
		}
	}()
	h, e := workspace.New(p, workspace.Config{Domain: "localhost:3000", URI: "http://localhost:3000", ChainID: 31337, Arbiters: addresses[2:]})
	if e != nil {
		t.Fatal(e)
	}
	call := func(method, path, token string, body any) (int, map[string]any) {
		b, _ := json.Marshal(body)
		r := httptest.NewRequest(method, path, bytes.NewReader(b))
		r.Header.Set("Content-Type", "application/json")
		if token != "" {
			r.Header.Set("Authorization", "Bearer "+token)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		var d map[string]any
		_ = json.Unmarshal(w.Body.Bytes(), &d)
		return w.Code, d
	}
	login := func(i int) string {
		status, c := call("POST", "/api/v1/auth/challenge", "", map[string]string{"address": addresses[i]})
		if status != 201 {
			t.Fatalf("challenge status %d", status)
		}
		sig, err := crypto.Sign(accounts.TextHash([]byte(c["message"].(string))), keys[i])
		if err != nil {
			t.Fatal(err)
		}
		sig[64] += 27
		status, s := call("POST", "/api/v1/auth/verify", "", map[string]any{"challenge_id": c["challenge_id"], "signature": "0x" + hex.EncodeToString(sig)})
		if status != 200 {
			t.Fatalf("verify status %d", status)
		}
		return s["token"].(string)
	}
	buyer, worker := login(0), login(1)
	// Check the initial schema and persisted audience, not merely login success.
	hash := sha256.Sum256([]byte(buyer))
	var audience string
	if e = p.QueryRow(ctx, "SELECT audience FROM proofpay.sessions WHERE token_hash=$1", hash[:]).Scan(&audience); e != nil {
		t.Fatal("session audience read failed")
	}
	if audience != `["localhost:3000","http://localhost:3000",31337]` {
		t.Fatal("session audience mismatch")
	}
	status, task := call("POST", "/api/v1/tasks", buyer, map[string]any{"title": "Temporary backend verification — no funding", "worker": addresses[1], "primary_arbiter": addresses[2], "backup_arbiter": addresses[3], "source": map[string]string{"greeting": "Hello {name}"}, "delivery_deadline": time.Now().UTC().Add(48 * time.Hour).Format(time.RFC3339), "deliverables": []map[string]any{{"id": "id-json", "title": "Indonesian", "criteria": "Preserve meaning and placeholders", "amount_base_units": "1000000", "revision_limit": 2, "review_period_hours": 48}}})
	if status != 201 {
		t.Fatalf("create status %d", status)
	}
	id := task["id"].(string)
	status, task = call("POST", "/api/v1/tasks/"+id+"/accept", worker, map[string]any{"manifest_hash": task["manifest_hash"]})
	if status != http.StatusOK || task["status"] != "accepted_unfunded" {
		t.Fatalf("accept status %d", status)
	}
	status, _ = call("POST", "/api/v1/auth/logout", buyer, map[string]any{})
	if status != 200 && status != 204 {
		t.Fatalf("logout %d", status)
	}
	status, _ = call("GET", "/api/v1/me", buyer, nil)
	if status != 401 {
		t.Fatal("logout not revoked")
	}
	t.Log("Hosted runtime-role challenge/signature/session/create/accept/logout verified; no chain transaction")
}
