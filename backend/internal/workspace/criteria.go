package workspace

import (
	"encoding/json"
	"errors"
	"io"
	"strings"
	"unicode/utf8"
)

// criteriaAllow is the fixed check topology for criteria-v1. New check IDs
// require a criteria version bump, never silent extension.
var criteriaAllow = map[string]bool{"key_parity": true, "nonempty": true, "placeholders": true, "required_terms": true, "human_review": true}

type CriteriaCheck struct {
	ID      string
	Enabled bool
	Terms   []string
	Prompt  string
}
type Criteria struct {
	Version string
	Checker string
	Checks  []CriteriaCheck
}

// ParseCriteria validates structured criteria-v1. Legacy prose is NOT parsed
// here; callers accept prose unless the value looks like JSON. Draft versions
// (criteria-v1-draft) are never pinned and are rejected.
func ParseCriteria(s string) (Criteria, error) {
	var c Criteria
	bad := errors.New("invalid criteria")
	if !utf8.ValidString(s) || strings.ContainsRune(s, 0) {
		return c, bad
	}
	d := json.NewDecoder(strings.NewReader(s))
	d.UseNumber()
	if err := strictValue(d, 0, nil); err != nil {
		return c, bad
	}
	if _, err := d.Token(); err != io.EOF {
		return c, bad
	}
	var root struct {
		CriteriaVersion string           `json:"criteria_version"`
		CheckerVersion  string           `json:"checker_version"`
		Checks          []map[string]any `json:"checks"`
	}
	dec := json.NewDecoder(strings.NewReader(s))
	dec.UseNumber()
	dec.DisallowUnknownFields()
	if err := dec.Decode(&root); err != nil {
		return c, bad
	}
	if _, err := dec.Token(); err != io.EOF {
		return c, bad
	}
	if root.CriteriaVersion != "criteria-v1" || root.CheckerVersion != "localization-v1" {
		return c, bad
	}
	if len(root.Checks) < 1 || len(root.Checks) > 5 {
		return c, bad
	}
	seen := map[string]bool{}
	c = Criteria{Version: "criteria-v1", Checker: "localization-v1"}
	for _, m := range root.Checks {
		if len(m) < 1 || len(m) > 2 {
			return Criteria{}, bad
		}
		id, ok := m["id"].(string)
		if !ok || !criteriaAllow[id] || seen[id] {
			return Criteria{}, bad
		}
		seen[id] = true
		params := map[string]any{}
		if pv, present := m["params"]; present {
			params, ok = pv.(map[string]any)
			if !ok {
				return Criteria{}, bad
			}
		}
		check := CriteriaCheck{ID: id, Enabled: true}
		switch id {
		case "key_parity", "nonempty":
			if len(params) != 0 {
				return Criteria{}, bad
			}
		case "placeholders":
			if len(params) > 1 {
				return Criteria{}, bad
			}
			if ev, present := params["enabled"]; present {
				enabled, ok := ev.(bool)
				if !ok || len(params) != 1 {
					return Criteria{}, bad
				}
				check.Enabled = enabled
			} else if len(params) != 0 {
				return Criteria{}, bad
			}
		case "required_terms":
			if len(params) > 1 {
				return Criteria{}, bad
			}
			if tv, present := params["terms"]; present {
				terms, ok := tv.([]any)
				if !ok || len(terms) > 30 || len(params) != 1 {
					return Criteria{}, bad
				}
				for _, t := range terms {
					s, ok := t.(string)
					if !ok || strings.TrimSpace(s) == "" || len(s) > 100 {
						return Criteria{}, bad
					}
					check.Terms = append(check.Terms, s)
				}
			} else if len(params) != 0 {
				return Criteria{}, bad
			}
		case "human_review":
			if len(params) < 1 || len(params) > 2 {
				return Criteria{}, bad
			}
			prompt, ok := params["prompt"].(string)
			if !ok || strings.TrimSpace(prompt) == "" || utf8.RuneCountInString(prompt) > 500 {
				return Criteria{}, bad
			}
			check.Prompt = prompt
			if rv, present := params["required"]; present {
				if _, ok := rv.(bool); !ok {
					return Criteria{}, bad
				}
			}
		}
		c.Checks = append(c.Checks, check)
	}
	return c, nil
}

// RulesFromCriteria derives deterministic checker rules from pinned criteria.
// Human checks contribute no machine rules.
func RulesFromCriteria(c Criteria) deliveryRules {
	rules := deliveryRules{RequiredTerms: []string{}}
	for _, check := range c.Checks {
		switch check.ID {
		case "placeholders":
			rules.PreservePlaceholders = check.Enabled
		case "required_terms":
			rules.RequiredTerms = append(rules.RequiredTerms, check.Terms...)
		}
	}
	return rules
}
