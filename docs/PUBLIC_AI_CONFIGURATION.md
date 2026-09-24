# Public AI configuration

The executable refuses unbudgeted AI review without a persistent authenticated workspace. Both browser and Go must explicitly set `PACTRA_PUBLIC_AI_ENABLED=true`; Go additionally requires `PACTRA_AI_WALLET_DAILY` and `PACTRA_AI_GLOBAL_DAILY` in the hard bounded range documented in AI_BUDGETS.md. Zero/missing limits do not silently become unlimited.

Server-only Azure settings remain `PACTRA_AI_ENDPOINT`, `PACTRA_AI_MODEL`, `PACTRA_AI_KEY`. Never pass keys as public env or client JSON. With no provider key, an admitted request returns unavailable and still consumes its request reservation. Counters reset by UTC day identity, not process restart; failed/uncertain requests are not refunded. Do not delete counters to retry.

Keep provider billing-side caps and observe costs separately: request caps are not dollar/token budgets. The private public-launch service should initially remain disabled until real-wallet QA and provider spending policy are approved. The local integrated test verifies auth, provider-unavailable and cap exhaustion without spending.

`/api/review` and `/api/workspace/review` both share the same BFF and the same Go `POST /api/v1/review` authorization/budget wrapper. Cookie, exact Origin, selected wallet and chain checks all apply. The standalone checker remains available without wallet or provider.
