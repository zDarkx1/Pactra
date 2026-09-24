package workspace

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"reflect"
	"strings"
	"testing"
)

func TestPaginationParticipantStableTies(t *testing.T) {
	p, h, ks := reliabilitySetup(t)
	tokens := make([]string, len(ks))
	for i, k := range ks {
		tokens[i] = login(t, h, k)
	}
	code, original := call(t, h, "POST", "/api/v1/tasks", tokens[0], terms(ks))
	expect(t, 201, code, original)
	// Immutable fixtures are inserted, never updated; all share one creation time.
	for i := 1; i <= 8; i++ {
		buyer, worker := addr(ks[0]), addr(ks[1])
		if i%3 == 1 {
			buyer, worker = addr(ks[4]), addr(ks[0])
		}
		if i%3 == 2 {
			buyer, worker = addr(ks[4]), addr(ks[1])
		}
		id := fmt.Sprintf("00000000-0000-4000-8000-%012d", i)
		var manifest Manifest
		if e := json.Unmarshal(reliabilityBody(t, original["manifest"]), &manifest); e != nil {
			t.Fatal(e)
		}
		manifest.Buyer, manifest.Worker = buyer, worker
		canonical, e := canonicalJSON(manifest)
		if e != nil {
			t.Fatal(e)
		}
		hash := sha256.Sum256(canonical)
		_, e = p.Exec(context.Background(), `INSERT INTO pactra.tasks(id,buyer,worker,primary_arbiter,backup_arbiter,manifest,manifest_json,manifest_hash,created_at,invite_expires_at,delivery_deadline) SELECT $2,$3,$4,primary_arbiter,backup_arbiter,$5::text::jsonb,$5::text,$6,created_at,invite_expires_at,delivery_deadline FROM pactra.tasks WHERE id=$1`, original["id"], id, buyer, worker, string(canonical), hex.EncodeToString(hash[:]))
		if e != nil {
			t.Fatal(e)
		}
	}
	var want []string
	rows, e := p.Query(context.Background(), "SELECT id::text FROM pactra.tasks WHERE buyer=$1 OR worker=$1 ORDER BY created_at DESC,id DESC", addr(ks[0]))
	if e != nil {
		t.Fatal(e)
	}
	for rows.Next() {
		var id string
		if e = rows.Scan(&id); e != nil {
			t.Fatal(e)
		}
		want = append(want, id)
	}
	if e = rows.Err(); e != nil {
		t.Fatal(e)
	}
	rows.Close()
	if len(want) != 6 {
		t.Fatalf("fixture participant count: %d", len(want))
	}
	for _, limit := range []int{1, 2, 50} {
		var got []string
		cursor := ""
		for page := 0; page < 20; page++ {
			path := fmt.Sprintf("/api/v1/tasks?limit=%d", limit)
			if cursor != "" {
				path += "&cursor=" + url.QueryEscape(cursor)
			}
			code, v := call(t, h, "GET", path, tokens[0], nil)
			expect(t, 200, code, v)
			tasks := v["tasks"].([]any)
			if len(tasks) > limit {
				t.Fatal("limit ignored")
			}
			for _, item := range tasks {
				got = append(got, item.(map[string]any)["id"].(string))
			}
			next, exists := v["next_cursor"]
			if !exists {
				t.Fatal("next_cursor missing")
			}
			if next == nil {
				break
			}
			nextString, ok := next.(string)
			if !ok || nextString == "" || nextString == cursor {
				t.Fatalf("invalid next_cursor %v", next)
			}
			cursor = nextString
			// Neither an unrelated account nor an arbiter can use another user's cursor to see tasks.
			for _, idx := range []int{2, 3} {
				c, v := call(t, h, "GET", "/api/v1/tasks?limit=1&cursor="+url.QueryEscape(cursor), tokens[idx], nil)
				expect(t, 200, c, v)
				if len(v["tasks"].([]any)) != 0 || v["next_cursor"] != nil {
					t.Fatal("arbiter privacy", v)
				}
			}
		}
		if !reflect.DeepEqual(want, got) {
			t.Fatalf("limit=%d want %v got %v", limit, want, got)
		}
	}
	// A newer insert after page one cannot shift the continuation or repeat a row.
	code, page := call(t, h, "GET", "/api/v1/tasks?limit=1", tokens[0], nil)
	expect(t, 200, code, page)
	cursor := page["next_cursor"].(string)
	code, v := call(t, h, "POST", "/api/v1/tasks", tokens[0], terms(ks))
	expect(t, 201, code, v)
	code, v = call(t, h, "GET", "/api/v1/tasks?limit=50&cursor="+url.QueryEscape(cursor), tokens[0], nil)
	expect(t, 200, code, v)
	var got []string
	for _, item := range v["tasks"].([]any) {
		got = append(got, item.(map[string]any)["id"].(string))
	}
	if !reflect.DeepEqual(want[1:], got) || v["next_cursor"] != nil {
		t.Fatalf("insert shifted continuation: %v", v)
	}
	// Default and maximum pages both cap at 50, using a lookahead row.
	_, e = p.Exec(context.Background(), `INSERT INTO pactra.tasks(id,buyer,worker,primary_arbiter,backup_arbiter,manifest,manifest_json,manifest_hash,created_at,invite_expires_at,delivery_deadline) SELECT ('00000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,buyer,worker,primary_arbiter,backup_arbiter,manifest,manifest_json,manifest_hash,created_at,invite_expires_at,delivery_deadline FROM pactra.tasks CROSS JOIN generate_series(100,150) AS n WHERE id=$1`, original["id"])
	if e != nil {
		t.Fatal(e)
	}
	for _, path := range []string{"/api/v1/tasks", "/api/v1/tasks?limit=50"} {
		code, v := call(t, h, "GET", path, tokens[0], nil)
		expect(t, 200, code, v)
		if len(v["tasks"].([]any)) != 50 {
			t.Fatal("default/max limit", v)
		}
		cursor, ok := v["next_cursor"].(string)
		if !ok || cursor == "" {
			t.Fatal("missing lookahead cursor", v)
		}
	}
}

func TestPaginationMalformedAndEmpty(t *testing.T) {
	_, h, ks := reliabilitySetup(t)
	token := login(t, h, ks[0])
	for _, query := range []string{"limit=0", "limit=51", "limit=-1", "limit=1.5", "limit=abc", "limit=", "limit=1&limit=2", "limit=99999999999999999999999", "limit=%2B1", "cursor=", "cursor=bad", "cursor=%25", "cursor=a&cursor=b", "cursor=" + strings.Repeat("a", 1024), "cursor=" + base64.RawURLEncoding.EncodeToString([]byte("1\nnot-a-date\n00000000-0000-4000-8000-000000000001")), "cursor=" + base64.RawURLEncoding.EncodeToString([]byte("1\n2026-01-01T00:00:00Z\ninvalid-id")), "cursor=" + base64.RawURLEncoding.EncodeToString([]byte("2\n2026-01-01T00:00:00Z\n00000000-0000-4000-8000-000000000001")), "limit=%zz"} {
		code, v := call(t, h, "GET", "/api/v1/tasks?"+query, token, nil)
		if code != 400 {
			t.Errorf("query %q: %d %v", query, code, v)
		}
	}
	code, v := call(t, h, "GET", "/api/v1/tasks", token, nil)
	expect(t, 200, code, v)
	next, ok := v["next_cursor"]
	if !ok || next != nil || len(v["tasks"].([]any)) != 0 {
		t.Fatal(v)
	}
}
