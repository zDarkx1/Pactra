package workspace

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestOnchainDisabledAndParticipantBoundary(t *testing.T) {
	f := deliverySetup(t, true, 2)
	h, e := New(f.p, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1})
	if e != nil {
		t.Fatal(e)
	}
	c, v := call(t, h, "GET", "/api/v1/onchain/config", f.tokens[0], nil)
	expect(t, 200, c, v)
	if v["enabled"] != false || v["attestation_available"] != false {
		t.Fatal(v)
	}
	for _, op := range []string{"onchain/reconcile", "deliverables/proof-1/onchain/availability"} {
		c, v = call(t, h, "POST", "/api/v1/tasks/"+f.id+"/"+op, f.tokens[0], map[string]any{})
		expect(t, 503, c, v)
		c, v = call(t, h, "POST", "/api/v1/tasks/"+f.id+"/"+op, f.tokens[4], map[string]any{})
		expect(t, 404, c, v)
	}
}
func TestOnchainConfigFailClosed(t *testing.T) {
	for _, env := range []map[string]string{{"PACTRA_ONCHAIN_ENABLED": "yes"}, {"PACTRA_ONCHAIN_ENABLED": "true"}, {"PACTRA_ONCHAIN_ENABLED": "true", "PACTRA_ONCHAIN_RPC_URL": "https://rpc.invalid", "PACTRA_ONCHAIN_ESCROW": "0x123"}} {
		if _, e := LoadOnchainConfig(func(k string) string { return env[k] }, 1); e == nil {
			t.Fatal("accepted missing/malformed config")
		}
	}
	cfg, e := LoadOnchainConfig(func(string) string { return "" }, 1)
	if e != nil || cfg != nil {
		t.Fatal("must default disabled")
	}
}
func TestRPCDoesNotTrustMalformedOrFailedReceipt(t *testing.T) {
	for _, response := range []string{`{"jsonrpc":"2.0","id":1,"result":null}`, `{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"secret"}}`, `not json`} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(response)) }))
		c := &OnchainConfig{RPCURL: srv.URL, ChainID: 1, Escrow: "0x1111111111111111111111111111111111111111", Confirmations: 2}
		_, e := c.verifyCreation(context.Background(), "0x"+strings.Repeat("1", 64), Manifest{}, strings.Repeat("2", 64))
		srv.Close()
		if e == nil {
			t.Fatal("accepted unverified receipt")
		}
	}
}
