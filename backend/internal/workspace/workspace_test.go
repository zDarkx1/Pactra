package workspace

import (
	"context"
	"github.com/jackc/pgx/v5/pgxpool"
	"os"
	"testing"
)

func testPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL required")
	}
	p, e := pgxpool.New(context.Background(), dsn)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(p.Close)
	if _, e = p.Exec(context.Background(), "DROP SCHEMA IF EXISTS proofpay CASCADE"); e != nil {
		t.Fatal(e)
	}
	sql, e := os.ReadFile("../../migrations/0001_workspace.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = p.Exec(context.Background(), string(sql)); e != nil {
		t.Fatal(e)
	}
	return p
}
func TestConfig(t *testing.T) {
	p := testPool(t)
	good := Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1}
	if _, e := New(p, good); e != nil {
		t.Fatal(e)
	}
	bad := []Config{{Domain: "example.com", URI: "http://example.com", ChainID: 1}, {Domain: "example.com", URI: "https://evil.com", ChainID: 1}, {Domain: "localhost", URI: "http://localhost", ChainID: 0}}
	for _, c := range bad {
		if _, e := New(p, c); e == nil {
			t.Fatalf("accepted bad config %+v", c)
		}
	}
}
