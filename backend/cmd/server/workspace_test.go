package main

import (
	"strings"
	"testing"
)

func TestWorkspaceEnvironment(t *testing.T) {
	for _, tc := range []struct {
		name string
		env  map[string]string
		want bool
	}{
		{"host override", map[string]string{"DATABASE_URL": "postgres://u:p@localhost/x?host=remote.invalid&sslmode=disable", "PROOFPAY_AUTH_DOMAIN": "localhost:3000", "PROOFPAY_AUTH_URI": "http://localhost:3000", "PROOFPAY_CHAIN_ID": "1"}, false},
		{"disabled", map[string]string{}, true},
		{"partial", map[string]string{"PROOFPAY_AUTH_DOMAIN": "localhost:3000"}, false},
		{"unsafe remote", map[string]string{"DATABASE_URL": "postgres://u:p@db.example/x?sslmode=disable", "PROOFPAY_AUTH_DOMAIN": "localhost:3000", "PROOFPAY_AUTH_URI": "http://localhost:3000", "PROOFPAY_CHAIN_ID": "1"}, false},
		{"enabled local", map[string]string{"DATABASE_URL": "postgres://u:p@localhost/x?sslmode=disable", "PROOFPAY_AUTH_DOMAIN": "localhost:3000", "PROOFPAY_AUTH_URI": "http://localhost:3000", "PROOFPAY_CHAIN_ID": "1"}, true},
		{"bad chain", map[string]string{"DATABASE_URL": "postgres://u:p@localhost/x?sslmode=disable", "PROOFPAY_AUTH_DOMAIN": "localhost:3000", "PROOFPAY_AUTH_URI": "http://localhost:3000", "PROOFPAY_CHAIN_ID": "0"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, _, err := workspaceEnvironment(func(k string) string { return tc.env[k] })
			if (err == nil) != tc.want {
				t.Fatalf("error=%v want success=%v", err, tc.want)
			}
			if err != nil && strings.Contains(err.Error(), "u:p") {
				t.Fatal("credentials exposed")
			}
		})
	}
}
