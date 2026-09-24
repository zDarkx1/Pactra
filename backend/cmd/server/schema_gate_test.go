package main

import (
	"strings"
	"testing"
)

func TestWorkspaceSchemaGateRequiresAllMigrations(t *testing.T) {
	for _, name := range []string{"tasks", "task_idempotency", "delivery_events", "delivery_idempotency", "ai_usage_global", "ai_usage_wallet", "has_table_privilege", "has_schema_privilege"} {
		if !strings.Contains(workspaceSchemaQuery, name) {
			t.Fatalf("readiness omits %s", name)
		}
	}
}
