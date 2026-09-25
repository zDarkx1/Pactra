# Finding Pactra tables in Supabase

Project: https://supabase.com/dashboard/project/ncnuvnbqcaqwawujltiu/editor

The application tables are in the private `pactra` schema, not the default `public` schema. In Table Editor choose the schema dropdown and select `pactra`. Use the exact project above (Pactra, separate from TerasKayuManis).

Read-only SQL in SQL Editor:

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'pactra'
  and table_type = 'BASE TABLE'
order by table_name;
```

Verified live: accounts, ai_usage_global, ai_usage_wallet, challenge_limits, challenges, delivery_events, delivery_idempotency, sessions, task_idempotency, tasks.

At the verified deployment check on 2026-09-24, no tasks existed yet because genuine arbiter addresses have not been configured. Login is wallet SIWE handled by Go; Supabase Authentication > Users is not the account registry. Inspect pactra.accounts instead. Temporary deployment-test account was removed after logout.

Do not expose this schema through the Data API or grant anonymous access merely to make tables visible. The private backend uses a restricted database role.
