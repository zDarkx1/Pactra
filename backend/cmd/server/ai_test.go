package main

import (
	"context"
	"proofpay/backend"
	"strings"
	"testing"
)

func TestAIEnvironmentAndStartupValidation(t *testing.T) {
	env := map[string]string{"PROOFPAY_AI_ENDPOINT": "https://unit.services.ai.azure.com/openai/v1/responses", "PROOFPAY_AI_MODEL": "test-model", "PROOFPAY_AI_KEY": "fake-test-key"}
	got := aiConfig(func(k string) string { return env[k] })
	if got.Endpoint != env["PROOFPAY_AI_ENDPOINT"] || got.Model != env["PROOFPAY_AI_MODEL"] || got.APIKey != env["PROOFPAY_AI_KEY"] {
		t.Fatal("config mapping")
	}
	if empty := aiConfig(func(string) string { return "" }); empty != (backend.AIConfig{}) {
		t.Fatal("default not disabled")
	}
	// Validation must precede even an invalid listen address; errors never include secrets.
	got.Endpoint = "http://invalid.test/secret-path"
	err := runWithAI(context.Background(), "bad address", got)
	if err == nil || !strings.Contains(err.Error(), "invalid AI configuration") || strings.Contains(err.Error(), "secret-path") || strings.Contains(err.Error(), "fake-test-key") {
		t.Fatalf("unsafe or missing config error: %v", err)
	}
}
