package workspace

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode"
)

// Exercise the actual authenticated handler, persisted history and checker, then
// hand their response bytes to the frontend tests. No fabricated API snapshots.
func TestDeliveryUnicodeCompatibility(t *testing.T) {
	f := deliverySetup(t, true, 2)
	whitespace := []string{}
	for r := rune(0); r <= unicode.MaxRune; r++ {
		if unicode.IsSpace(r) {
			whitespace = append(whitespace, string(r))
		}
	}
	for _, key := range append(append([]string{}, whitespace...), "", strings.Join(whitespace, "")) {
		in := f.submitInput(0, "")
		in["artifact"] = map[string]string{key: "legitimate string"}
		f.call(t, "submissions", 1, in, 400)
	}
	for _, key := range []string{`\ud800`, `\udbff`, `\udc00`, `\udfff`, `\udc00\ud800`} {
		in := f.submitInput(0, "")
		in["artifact"] = json.RawMessage(`{"` + key + `":"legitimate string"}`)
		f.call(t, "submissions", 1, in, 400)
	}
	artifact := map[string]string{}
	for _, key := range []string{"\ufeff", "\u0085\ufeff\u3000", "\u180e", "\u200b", "\u001c", "\u001d", "\u001e", "\u001f", "😀", "é", "e\u0301", strings.Join(whitespace, "") + "key" + strings.Join(whitespace, "")} {
		if strings.TrimSpace(key) == "" {
			t.Fatalf("expected Go-nonblank key %q", key)
		}
		artifact[key] = "legitimate string"
	}
	in := f.submitInput(0, "")
	in["artifact"] = artifact
	raw, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	post := deliveryRequest(f.h, "POST", f.base+"/submissions", f.tokens[1], string(raw))
	expect(t, 201, post.Code, post.Body.String())
	get := deliveryRequest(f.h, "GET", f.base+"/submissions", f.tokens[0], "")
	expect(t, 200, get.Code, get.Body.String())
	var postSnapshot, getSnapshot map[string]any
	if err := json.Unmarshal(post.Body.Bytes(), &postSnapshot); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(get.Body.Bytes(), &getSnapshot); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(postSnapshot, getSnapshot) {
		t.Fatal("committed POST snapshot differs from participant GET")
	}
	deliveryState(t, getSnapshot, "submitted", 1)
	stored := getSnapshot["submissions"].([]any)[0].(map[string]any)["artifact"].(map[string]any)
	if len(stored) != len(artifact) {
		t.Fatal("artifact keys changed")
	}
	for key, value := range artifact {
		if stored[key] != value {
			t.Fatalf("artifact key %q changed", key)
		}
	}
	t.Logf("authenticated POST=%d GET=%d; committed Unicode artifact keys preserved", post.Code, get.Code)
	fixture, err := json.Marshal(map[string]any{
		"post": json.RawMessage(post.Body.Bytes()), "get": json.RawMessage(get.Body.Bytes()),
		"artifact": artifact, "whitespace": whitespace,
	})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "delivery-unicode-response.json")
	if err := os.WriteFile(path, fixture, 0600); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("node", "--experimental-strip-types", "--test", "tests/delivery-types.test.ts")
	cmd.Dir = "../../../frontend"
	cmd.Env = append(os.Environ(), "PACTRA_DELIVERY_UNICODE_RESPONSE="+path)
	output, err := cmd.CombinedOutput()
	t.Log(string(output))
	if err != nil {
		t.Fatal(fmt.Errorf("frontend compatibility regression: %w", err))
	}
}
