package workspace

import (
	"net"
	"net/netip"
	"sync"
	"time"
)

const clientChallengeLimit = 10
const maxChallengeClients = 1024
const clientChallengeTTL = time.Minute

type clientWindow struct {
	expires time.Time
	count   int
}
type clientBudget struct {
	sync.Mutex
	entries map[netip.Addr]clientWindow
}

var challengeClients clientBudget

// RemoteAddr is the socket peer, never a forwarding header. Behind a proxy all
// callers share the proxy's quota; trusted proxy support must be designed separately.
func (b *clientBudget) allow(remote string, now time.Time) bool {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return false
	}
	ip, err := netip.ParseAddr(host)
	if err != nil || ip.Zone() != "" {
		return false
	}
	ip = ip.Unmap()
	b.Lock()
	defer b.Unlock()
	if b.entries == nil {
		b.entries = make(map[netip.Addr]clientWindow)
	}
	for k, v := range b.entries {
		if !now.Before(v.expires) {
			delete(b.entries, k)
		}
	}
	v, exists := b.entries[ip]
	if !exists {
		if len(b.entries) >= maxChallengeClients {
			return false
		}
		v = clientWindow{expires: now.Add(clientChallengeTTL)}
	}
	if v.count >= clientChallengeLimit {
		return false
	}
	v.count++
	b.entries[ip] = v
	return true
}
