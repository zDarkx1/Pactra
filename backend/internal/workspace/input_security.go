package workspace

import (
	"encoding/json"
	"strconv"
	"unicode/utf8"
)

// JSON tuple framing preserves every configured audience component without
// delimiter ambiguity. Configuration changes invalidate previously issued tokens.
func (s *server) audience() string {
	b, _ := json.Marshal([]any{s.cfg.Domain, s.cfg.URI, s.cfg.ChainID})
	return string(b)
}

// Validate before encoding/json can replace malformed UTF-8 or lone UTF-16
// surrogates. The regular decoder remains responsible for all JSON syntax.
func validJSONUnicode(b []byte) bool {
	if !utf8.Valid(b) {
		return false
	}
	inString := false
	for i := 0; i < len(b); i++ {
		if b[i] == '"' {
			inString = !inString
			continue
		}
		if !inString || b[i] != '\\' {
			continue
		}
		i++
		if i >= len(b) {
			return false
		}
		if b[i] != 'u' {
			continue
		}
		if i+4 >= len(b) {
			return false
		}
		n, e := strconv.ParseUint(string(b[i+1:i+5]), 16, 16)
		if e != nil {
			return false
		}
		i += 4
		if n >= 0xdc00 && n <= 0xdfff {
			return false
		}
		if n >= 0xd800 && n <= 0xdbff {
			if i+6 >= len(b) || b[i+1] != '\\' || b[i+2] != 'u' {
				return false
			}
			low, e := strconv.ParseUint(string(b[i+3:i+7]), 16, 16)
			if e != nil || low < 0xdc00 || low > 0xdfff {
				return false
			}
			i += 6
		}
	}
	return true
}
