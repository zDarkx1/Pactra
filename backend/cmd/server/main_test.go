package main

import (
	"context"
	"net"
	"strings"
	"testing"
)

func TestConfig(t *testing.T) {
	for _, tt := range []struct {
		name, host, port, want string
		bad                    bool
	}{
		{"defaults", "", "", "127.0.0.1:8080", false},
		{"IPv4", "0.0.0.0", "3000", "0.0.0.0:3000", false},
		{"IPv6", "::1", "8081", "[::1]:8081", false},
		{"bad host", "http://localhost", "8080", "", true},
		{"host whitespace", " 127.0.0.1", "8080", "", true},
		{"hostname unsupported", "localhost", "8080", "", true},
		{"zero", "", "0", "", true}, {"overflow", "", "65536", "", true}, {"negative", "", "-1", "", true}, {"port whitespace", "", " 80", "", true}, {"port text", "", "http", "", true}, {"signed", "", "+80", "", true},
	} {
		t.Run(tt.name, func(t *testing.T) {
			env := map[string]string{"HOST": tt.host, "PORT": tt.port}
			got, err := address(func(k string) string { return env[k] })
			if (err != nil) != tt.bad {
				t.Fatalf("error %v", err)
			}
			if !tt.bad && got != tt.want {
				t.Fatalf("got %s", got)
			}
		})
	}
}
func TestStartupBindFailure(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	err = run(context.Background(), l.Addr().String())
	if err == nil || !strings.Contains(err.Error(), "listen") {
		t.Fatalf("expected bind failure, got %v", err)
	}
}
func TestCancelledShutdown(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := run(ctx, "127.0.0.1:0"); err != nil {
		t.Fatal(err)
	}
}
