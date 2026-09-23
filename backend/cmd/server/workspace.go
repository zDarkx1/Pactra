package main

import (
	"context"
	"errors"
	"github.com/jackc/pgx/v5/pgxpool"
	"net"
	"net/http"
	"net/url"
	"pactra/backend/internal/workspace"
	"strconv"
	"strings"
	"time"
)

func workspaceEnvironment(get func(string) string) (string, workspace.Config, error) {
	dsn := get("DATABASE_URL")
	cfg := workspace.Config{Domain: get("PACTRA_AUTH_DOMAIN"), URI: get("PACTRA_AUTH_URI")}
	chain := get("PACTRA_CHAIN_ID")
	arbiters := get("PACTRA_ARBITERS")
	invalid := errors.New("workspace requires DATABASE_URL, valid auth domain/URI and positive chain ID; remote DB requires sslmode=verify-full")
	if dsn == "" && cfg.Domain == "" && cfg.URI == "" && chain == "" && arbiters == "" {
		return "", cfg, nil
	}
	if dsn == "" || cfg.Domain == "" || cfg.URI == "" {
		return "", cfg, invalid
	}
	n, err := strconv.ParseInt(chain, 10, 64)
	if err != nil || n <= 0 {
		return "", cfg, invalid
	}
	cfg.ChainID = n
	u, err := url.Parse(dsn)
	if err != nil || !(u.Scheme == "postgres" || u.Scheme == "postgresql") {
		return "", cfg, invalid
	}
	// Accept only unambiguous URL settings. pgx query overrides and environment
	// service/host fallbacks must not bypass the verified-TLS requirement.
	allowedQuery := map[string]bool{"sslmode": true, "sslrootcert": true, "connect_timeout": true}
	for key, values := range u.Query() {
		if !allowedQuery[key] || len(values) != 1 {
			return "", cfg, invalid
		}
	}
	if u.Fragment != "" || strings.Contains(u.Host, ",") {
		return "", cfg, invalid
	}
	host := u.Hostname()
	if host == "" {
		return "", cfg, invalid
	}
	ip := net.ParseIP(host)
	local := host == "localhost" || (ip != nil && ip.IsLoopback()) || (host == "" && strings.HasPrefix(u.Query().Get("host"), "/"))
	if !local && u.Query().Get("sslmode") != "verify-full" {
		return "", cfg, invalid
	}
	if arbiters != "" {
		for _, a := range strings.Split(arbiters, ",") {
			cfg.Arbiters = append(cfg.Arbiters, strings.TrimSpace(a))
		}
	}
	return dsn, cfg, nil
}
func withWorkspace(ctx context.Context, fallback http.Handler, get func(string) string) (http.Handler, func(), error) {
	dsn, cfg, err := workspaceEnvironment(get)
	if err != nil {
		return nil, nil, err
	}
	if dsn == "" {
		return fallback, func() {}, nil
	}
	pc, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, nil, errors.New("invalid database configuration")
	}
	// Driver-effective target validation also protects against libpq-style
	// environment defaults overriding assumptions made from the URL.
	u, _ := url.Parse(dsn)
	if pc.ConnConfig.Host != u.Hostname() {
		return nil, nil, errors.New("ambiguous database host configuration")
	}
	ip := net.ParseIP(pc.ConnConfig.Host)
	if pc.ConnConfig.Host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		if pc.ConnConfig.TLSConfig == nil || pc.ConnConfig.TLSConfig.InsecureSkipVerify || pc.ConnConfig.TLSConfig.ServerName != pc.ConnConfig.Host || len(pc.ConnConfig.Fallbacks) > 0 {
			return nil, nil, errors.New("remote database requires verified TLS without fallbacks")
		}
	}
	pc.MaxConns = 4
	pc.MinConns = 0
	pc.ConnConfig.ConnectTimeout = 10 * time.Second
	pc.MaxConnLifetime = 30 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, pc)
	if err != nil {
		return nil, nil, errors.New("database initialization failed")
	}
	probe, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if err = pool.Ping(probe); err != nil {
		pool.Close()
		return nil, nil, errors.New("database connection failed")
	}
	h, err := workspace.New(pool, cfg)
	if err != nil {
		pool.Close()
		return nil, nil, errors.New("invalid workspace auth configuration")
	}
	var schema bool
	if err = pool.QueryRow(probe, "SELECT to_regclass('pactra.tasks') IS NOT NULL").Scan(&schema); err != nil || !schema {
		pool.Close()
		return nil, nil, errors.New("workspace migration is missing")
	}
	mux := http.NewServeMux()
	mux.Handle("/", fallback)
	mux.Handle("/api/v1/auth/", h)
	mux.Handle("/api/v1/me", h)
	mux.Handle("/api/v1/tasks", h)
	mux.Handle("/api/v1/tasks/", h)
	mux.HandleFunc("GET /ready", func(w http.ResponseWriter, r *http.Request) {
		c, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		if pool.Ping(c) != nil {
			w.WriteHeader(503)
			_, _ = w.Write([]byte(`{"status":"unavailable"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"ready","mode":"persistent-workspace"}`))
	})
	return mux, pool.Close, nil
}
