package backend

import "testing"

func TestAzureReasoningEnvelope(t *testing.T) {
	data := []byte(`{"status":"completed","error":null,"incomplete_details":null,"content_filters":[],"moderation":null,"frequency_penalty":0,"presence_penalty":0,"tool_usage":null,"top_logprobs":0,"output":[{"type":"reasoning","id":"r","content":[],"summary":[],"encrypted_content":null},{"type":"message","id":"m","role":"assistant","status":"completed","phase":"final_answer","content":[{"type":"output_text","text":"ok","annotations":[]}]}]}`)
	got, err := responseText(data)
	if err != nil || got != "ok" {
		t.Fatalf("Azure envelope rejected: %v", err)
	}
}
