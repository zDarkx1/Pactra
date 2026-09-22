package backend

import (
	"fmt"
	"strings"
	"testing"
)

func TestAdditionalBoundaries(t *testing.T) {
	one := map[string]string{"a": "x"}
	twoHundred := make(map[string]string)
	for i := 0; i < 200; i++ {
		twoHundred[fmt.Sprintf("k%03d", i)] = "x"
	}
	thirty := make([]string, 30)
	for i := range thirty {
		thirty[i] = strings.Repeat("x", 100)
	}
	for _, tt := range []struct {
		name, body string
		status     int
	}{
		{"200 keys each", payload(twoHundred, twoHundred, false, []string{}), 200},
		{"30 terms of 100 bytes", payload(one, one, false, thirty), 200},
		{"200 byte submission key", payload(one, map[string]string{strings.Repeat("é", 100): "x"}, false, []string{}), 200},
		{"202 byte submission key", payload(one, map[string]string{strings.Repeat("é", 101): "x"}, false, []string{}), 400},
		{"4000 byte submission", payload(one, map[string]string{"a": strings.Repeat("é", 2000)}, false, []string{}), 200},
		{"one byte over body limit", valid + strings.Repeat(" ", maxBody-len(valid)+1), 413},
		{"missing source", `{"submission":{"a":"x"},"rules":{"preserve_placeholders":false,"required_terms":[]}}`, 400},
		{"missing submission", `{"source":{"a":"x"},"rules":{"preserve_placeholders":false,"required_terms":[]}}`, 400},
		{"missing boolean", strings.Replace(valid, `"preserve_placeholders":true,`, "", 1), 400},
		{"missing terms", strings.Replace(valid, `,"required_terms":[]`, "", 1), 400},
		{"empty rules", `{"source":{"a":"x"},"submission":{"a":"x"},"rules":{}}`, 400},
		{"boolean string", strings.Replace(valid, `:true`, `:"false"`, 1), 400},
		{"term numeric", strings.Replace(valid, `"required_terms":[]`, `"required_terms":[1]`, 1), 400},
		{"deep malformed", strings.Repeat("[", 100) + strings.Repeat("]", 100), 400},
	} {
		t.Run(tt.name, func(t *testing.T) {
			w := call(NewHandler(), "POST", "/api/v1/check", "application/json", tt.body)
			if w.Code != tt.status {
				t.Fatalf("got %d want %d: %s", w.Code, tt.status, w.Body.String())
			}
			if tt.status >= 400 {
				assertError(t, w)
			}
		})
	}
}
