package workspace

import (
	"github.com/ethereum/go-ethereum/crypto"
	"os"
	"path/filepath"
	"testing"
)

func TestAttestorKeyFileNeverPublic(t *testing.T) {
	path := filepath.Join(t.TempDir(), "attestor")
	k := key(t)
	secret := hexData(crypto.FromECDSA(k))[2:]
	if e := os.WriteFile(path, []byte(secret), 0644); e != nil {
		t.Fatal(e)
	}
	env := map[string]string{"PACTRA_ONCHAIN_ENABLED": "true", "PACTRA_ONCHAIN_RPC_URL": "http://127.0.0.1:1", "PACTRA_ONCHAIN_ESCROW": "0x1111111111111111111111111111111111111111", "PACTRA_ONCHAIN_CONFIRMATIONS": "1", "PACTRA_ONCHAIN_ATTESTOR_KEY_FILE": path}
	get := func(k string) string { return env[k] }
	if _, e := LoadOnchainConfig(get, 1); e == nil {
		t.Fatal("world-readable signer accepted")
	}
	if e := os.Chmod(path, 0600); e != nil {
		t.Fatal(e)
	}
	c, e := LoadOnchainConfig(get, 1)
	if e != nil || c.key == nil {
		t.Fatal("private key rejected", e)
	}
	link := filepath.Join(t.TempDir(), "link")
	if e := os.Symlink(path, link); e != nil {
		t.Fatal(e)
	}
	env["PACTRA_ONCHAIN_ATTESTOR_KEY_FILE"] = link
	if _, e := LoadOnchainConfig(get, 1); e == nil {
		t.Fatal("symlink signer accepted")
	}
	env["PACTRA_ONCHAIN_ATTESTOR_KEY_FILE"] = ""
	c, e = LoadOnchainConfig(get, 1)
	if e != nil || c.key != nil {
		t.Fatal("missing signer not disabled", e)
	}
}
