# Deterministic checker specification

## Research grounding
See [Research evidence](RESEARCH_EVIDENCE.md) for primary sources from NYC DCWP, W3C Internationalization and NIST, the precise claims they support, and limits on extrapolation. External sources motivate the design; they do not prove Pactra reduces disputes or certify its implementation.


Version: localization-v1. Input scope: flat string-valued JSON dictionaries only.

1. **Key parity:** every source key must appear in submission; extra keys fail. JSON key ordering must not change results.
2. **Nonblank:** each submitted string must contain non-whitespace content.
3. **Placeholders:** when enabled, match `{identifier}` where identifier uses letters/underscore initially and letters/digits/underscore subsequently. Compare occurrence counts for each matching source/submission key. `%s`, ICU MessageFormat, nested braces and HTML are not claimed supported.
4. **Required terms:** if a source value contains an exact configured term, the corresponding submission must contain that exact term. This is case-sensitive substring preservation, not glossary translation or token-boundary matching.

Checks are sorted deterministically. Source/submission mismatch can be reported as HTTP200 with passed=false. Malformed inputs are HTTP400. No Unicode normalization, language identification, plagiarism detection, semantic equivalence, medical/legal assessment or payment decision is performed.

## Version policy
Any change to meaning (placeholder grammar, case sensitivity, normalization, missing/extra handling) needs a new checker version, matching fixtures and API documentation. A future frozen manifest must select a checker version; silently changing accepted rules is prohibited.

## Future commitment design — unresolved
Use a versioned canonical manifest format with explicit parties, chain/contract context, source/submission commitments and reviewer/checker versions. Specify Unicode, numeric/string encoding, key order, nonce/salt and byte limits with cross-language test vectors. Starter does not output hashes: do not treat an arbitrary JSON serialization as a finished cross-language commitment protocol.
