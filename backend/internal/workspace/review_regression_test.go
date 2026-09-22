package workspace

import (
	"context"
	"crypto/sha256"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestReviewSessionAudience(t *testing.T) {
	p, h, ks := setup(t)
	token := login(t, h, ks[0])
	hash := sha256.Sum256([]byte(token))
	var audience string
	if e := p.QueryRow(context.Background(), "SELECT audience FROM proofpay.sessions WHERE token_hash=$1", hash[:]).Scan(&audience); e != nil {
		t.Fatal(e)
	}
	if audience != `["localhost:8080","http://localhost:8080",1]` {
		t.Fatal("wrong persisted audience")
	}
	for _, cfg := range []Config{
		{Domain: "other.example", URI: "https://other.example", ChainID: 1},
		{Domain: "localhost:8080", URI: "http://localhost:8080/other", ChainID: 1},
		{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 2},
	} {
		other, e := New(p, cfg)
		if e != nil {
			t.Fatal(e)
		}
		code, v := call(t, other, "GET", "/api/v1/me", token, nil)
		if code != 401 {
			t.Errorf("audience %+v: got %d %v", cfg, code, v)
		}
		code, v = call(t, other, "POST", "/api/v1/auth/logout", token, map[string]any{})
		if code != 401 {
			t.Errorf("cross-audience logout: %d %v", code, v)
		}
	}
	same, e := New(p, Config{Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 1})
	if e != nil {
		t.Fatal(e)
	}
	code, v := call(t, same, "GET", "/api/v1/me", token, nil)
	expect(t, 200, code, v)
}

func TestReviewExactJSON(t *testing.T) {
	for _, body := range []string{`{"worker":"a","Worker":"b"}`, `{"Worker":"b"}`, `{"deliverables":[{"Title":"x"}]}`, `{"deliverables":[{"revision_limit":1,"Revision_limit":2}]}`} {
		t.Run(body, func(t *testing.T) {
			var in TaskInput
			if decode(httptest.NewRecorder(), httptest.NewRequest("POST", "/", strings.NewReader(body)), &in) {
				t.Fatal("accepted alias")
			}
		})
	}
	var in TaskInput
	if !decode(httptest.NewRecorder(), httptest.NewRequest("POST", "/", strings.NewReader(`{"source":{"worker":"a","Worker":"b"}}`)), &in) || in.Source["worker"] != "a" || in.Source["Worker"] != "b" {
		t.Fatal("source case keys not preserved")
	}
}
func TestReviewUnicode(t *testing.T) {
	for _, body := range []string{`{"title":"\ud800"}`, `{"title":"\udc00"}`, `{"title":"\ud800\u0041"}`, `{"source":{"\udfff":"x"}}`, "{\"title\":\"\xff\"}"} {
		t.Run(body, func(t *testing.T) {
			var in TaskInput
			if decode(httptest.NewRecorder(), httptest.NewRequest("POST", "/", strings.NewReader(body)), &in) {
				t.Fatal("accepted invalid unicode")
			}
		})
	}
	for _, body := range []string{`{"title":"\ud83d\ude00"}`, `{"title":"\\ud800"}`, `{"title":"�"}`} {
		var in TaskInput
		if !decode(httptest.NewRecorder(), httptest.NewRequest("POST", "/", strings.NewReader(body)), &in) {
			t.Fatal("rejected valid unicode", body)
		}
	}
}
func challengeIP(h http.Handler, ip, a string) int {
	r := httptest.NewRequest("POST", "/api/v1/auth/challenge", strings.NewReader(`{"address":"`+a+`"}`))
	r.RemoteAddr = ip
	r.Header.Set("X-Forwarded-For", "203.0.113.123")
	r.Header.Set("Forwarded", "for=203.0.113.123")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w.Code
}
func TestReviewRejectedBudget(t *testing.T) {
	_, h, ks := setup(t)
	for i := 0; i < 60; i++ {
		challengeIP(h, "192.0.2.1:1234", addr(ks[0]))
	}
	globalChallenges.Lock()
	n := globalChallenges.count
	globalChallenges.Unlock()
	if n != 5 {
		t.Errorf("rejections spent global success quota: %d", n)
	}
	if code := challengeIP(h, "192.0.2.2:1234", addr(ks[1])); code != 201 {
		t.Errorf("other client blocked: %d", code)
	}
}
func TestReviewClientBudget(t *testing.T) {
	_, h, _ := setup(t)
	successes := 0
	for i := 0; i < 20; i++ {
		if challengeIP(h, "192.0.2.1:1234", addr(key(t))) == 201 {
			successes++
		}
	}
	if successes != 10 {
		t.Fatalf("one IP obtained %d challenges", successes)
	}
}

func TestReviewClientCache(t *testing.T) {
	var b clientBudget
	now := time.Now()
	for i := 0; i < maxChallengeClients; i++ {
		if !b.allow(fmt.Sprintf("198.18.%d.%d:1234", i/256, i%256), now) {
			t.Fatal("early cache rejection")
		}
	}
	if b.allow("203.0.113.1:1234", now) || len(b.entries) != maxChallengeClients {
		t.Fatal("cache must fail closed at capacity")
	}
	if !b.allow("198.18.0.0:9999", now) {
		t.Fatal("existing peer blocked by capacity")
	}
	if !b.allow("203.0.113.1:1234", now.Add(clientChallengeTTL)) || len(b.entries) != 1 {
		t.Fatal("TTL did not reclaim capacity")
	}
	for _, remote := range []string{"", "spoofed:1234", "192.0.2.1", "[fe80::1%eth0]:1"} {
		if b.allow(remote, now) {
			t.Fatal("accepted invalid peer", remote)
		}
	}
	var concurrent clientBudget
	var wg sync.WaitGroup
	results := make(chan bool, 100)
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			remote := fmt.Sprintf("192.0.2.1:%d", i)
			if i%2 == 0 {
				remote = fmt.Sprintf("[::ffff:192.0.2.1]:%d", i)
			}
			results <- concurrent.allow(remote, now)
		}(i)
	}
	wg.Wait()
	close(results)
	n := 0
	for ok := range results {
		if ok {
			n++
		}
	}
	if n != clientChallengeLimit {
		t.Fatalf("concurrent/IP alias budget: %d", n)
	}
}

func TestReviewGlobalSuccessCeiling(t *testing.T) {
	p, h, _ := setup(t)
	var wg sync.WaitGroup
	results := make(chan int, 70)
	for i := 0; i < 70; i++ {
		a := addr(key(t))
		wg.Add(1)
		go func(i int, a string) {
			defer wg.Done()
			results <- challengeIP(h, fmt.Sprintf("192.0.2.%d:1234", i+1), a)
		}(i, a)
	}
	wg.Wait()
	close(results)
	n := 0
	for code := range results {
		if code == 201 {
			n++
		} else if code != 429 {
			t.Fatalf("unexpected status %d", code)
		}
	}
	var stored int
	if e := p.QueryRow(context.Background(), "SELECT count(*) FROM proofpay.challenges").Scan(&stored); e != nil {
		t.Fatal(e)
	}
	if n != 60 || stored != 60 {
		t.Fatalf("global ceiling: successes=%d stored=%d", n, stored)
	}
}

func TestReviewChallengeURIAndChain(t *testing.T) {
	p, h, ks := setup(t)
	c := challengeFor(t, h, ks[0])
	for _, cfg := range []Config{{Domain: "localhost:8080", URI: "http://localhost:8080/other", ChainID: 1}, {Domain: "localhost:8080", URI: "http://localhost:8080", ChainID: 2}} {
		other, e := New(p, cfg)
		if e != nil {
			t.Fatal(e)
		}
		code, v := call(t, other, "POST", "/api/v1/auth/verify", "", signed(t, ks[0], c))
		expect(t, 401, code, v)
	}
	code, v := call(t, h, "POST", "/api/v1/auth/verify", "", signed(t, ks[0], c))
	expect(t, 200, code, v)
}
