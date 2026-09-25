package workspace

import (
	"context"
	"os"
	"testing"
)

func TestArbiterCannotReadUndisputedSibling(t *testing.T) {
	p, h, ks := setup(t)
	sql, e := os.ReadFile("../../migrations/0003_delivery_review.sql")
	if e != nil {
		t.Fatal(e)
	}
	if _, e = p.Exec(context.Background(), string(sql)); e != nil {
		t.Fatal(e)
	}
	tokens := make([]string, len(ks))
	for i, k := range ks {
		tokens[i] = login(t, h, k)
	}
	in := terms(ks)
	first := in["deliverables"].([]any)[0]
	in["deliverables"] = []any{first, map[string]any{"id": "private-sibling", "title": "Private", "criteria": "Private", "amount_base_units": "3", "revision_limit": 1, "review_period_hours": 24}}
	code, task := call(t, h, "POST", "/api/v1/tasks", tokens[0], in)
	expect(t, 201, code, task)
	id, hash := task["id"].(string), task["manifest_hash"].(string)
	code, v := call(t, h, "POST", "/api/v1/tasks/"+id+"/accept", tokens[1], map[string]string{"manifest_hash": hash})
	expect(t, 200, code, v)
	f := deliveryFixture{p: p, h: h, id: id, hash: hash, tokens: tokens, base: "/api/v1/tasks/" + id + "/deliverables/private-sibling"}
	f.call(t, "submissions", 1, f.submitInput(0, ""), 201)
	f.base = "/api/v1/tasks/" + id + "/deliverables/proof-1"
	snap := f.call(t, "submissions", 1, f.submitInput(0, ""), 201)
	f.call(t, "disputes", 0, f.input(1, deliveryHash(snap)), 201)
	for _, actor := range []int{2, 3} {
		code, v = call(t, h, "GET", "/api/v1/arbiter/tasks/"+id+"/deliverables/private-sibling/evidence", tokens[actor], nil)
		expect(t, 404, code, v)
		code, v = call(t, h, "GET", "/api/v1/arbiter/tasks/"+id+"/deliverables/proof-1/evidence", tokens[actor], nil)
		expect(t, 200, code, v)
		code, v = call(t, h, "GET", "/api/v1/arbiter/disputes?limit=1", tokens[actor], nil)
		expect(t, 200, code, v)
		cases := v["disputes"].([]any)
		if len(cases) != 1 || cases[0].(map[string]any)["deliverable_id"] != "proof-1" || v["next_cursor"] != nil {
			t.Fatal(v)
		}
	}
}
