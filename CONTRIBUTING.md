# Contributing

Read README and your role guide. Create feature branches from main (feat/checker-evidence, feat/manifest-drafts, etc.). Do not force-push shared branches.

One PR per coherent behavior: explain user problem, schema changes, tests, screenshots with synthetic data, security impact and unfinished work. Update docs/API.md and checker version when semantics change. Contract/financial PRs require independent review and explicit policy approval.

Use TDD for behavior, run root JS/docs/typecheck/build, backend race/vet and contracts fmt/build/test. Never remove a failing business assertion just to make CI green. CI does not deploy or spend money.

No credentials or private customer files. No fake wallet confirmations, AI fallback scores or mocked financial results in the real application. A feature not implemented must be labelled unavailable.

Owner adds team collaborators; no collaborator access has been assumed. Decide open-source license before publishing; this repository currently grants no explicit open-source license.
