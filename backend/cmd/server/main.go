// Command proofpay runs the local stateless localization checker.
package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"proofpay/backend"
)

func address(getenv func(string) string) (string, error) {
	host, port := getenv("HOST"), getenv("PORT")
	if host == "" {
		host = "127.0.0.1"
	}
	if port == "" {
		port = "8080"
	}
	// Numeric addresses avoid DNS/network dependencies and ambiguous bind targets.
	if net.ParseIP(host) == nil {
		return "", errors.New("HOST must be an IPv4 or IPv6 address")
	}
	for _, c := range port {
		if c < '0' || c > '9' {
			return "", errors.New("PORT must be an integer from 1 to 65535")
		}
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		return "", errors.New("PORT must be an integer from 1 to 65535")
	}
	return net.JoinHostPort(host, strconv.Itoa(n)), nil
}
func aiConfig(getenv func(string) string) backend.AIConfig {
	return backend.AIConfig{Endpoint: getenv("PROOFPAY_AI_ENDPOINT"), Model: getenv("PROOFPAY_AI_MODEL"), APIKey: getenv("PROOFPAY_AI_KEY")}
}
func run(ctx context.Context, addr string) error { return runWithAI(ctx, addr, backend.AIConfig{}) }
func runWithAI(ctx context.Context, addr string, config backend.AIConfig) error {
	return runConfigured(ctx, addr, config, func(string) string { return "" })
}
func runConfigured(ctx context.Context, addr string, config backend.AIConfig, getenv func(string) string) error {
	handler, err := backend.NewHandlerWithAI(config)
	if err != nil {
		return err
	}
	handler, cleanup, err := withWorkspace(ctx, handler, getenv)
	if err != nil {
		return err
	}
	defer cleanup()
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	defer listener.Close()
	server := &http.Server{Handler: handler, BaseContext: func(net.Listener) context.Context { return ctx }, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 35 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024}
	done := make(chan error, 1)
	go func() { done <- server.Serve(listener) }()
	select {
	case err := <-done:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			_ = server.Close()
			<-done
			return fmt.Errorf("shutdown: %w", err)
		}
		err := <-done
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	}
}
func main() {
	addr, err := address(os.Getenv)
	if err != nil {
		log.Print(err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := runConfigured(ctx, addr, aiConfig(os.Getenv), os.Getenv); err != nil {
		log.Print(err)
		os.Exit(1)
	}
}
