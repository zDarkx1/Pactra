# Operational checkpoint — 2026-09-25

- PR2 merged UI into main9bfd741; branch/PR CI passed and main rerun passed after upstream solc download connection reset.
- Real owner-supplied arbiter addresses configured in both public frontend/backend. Actual injected-wallet public session verified create form unlocked, no task posted. This does not prove arbiter wallet ownership; holders still test their own wallets.
- Public AI enabled after owner approval: authenticated wallet5/day and global30/day, existing Azure provider. Actual public BFF→Go→provider request returned200. Earlier configuration name mismatch temporarily prevented API startup; corrected to PACTRA_AI_KEY and readiness/auth verified. Invalid test payload400 corrected to include required rules; no fake successful provider output.
- One ephemeral test account has a durable AI quota row and is intentionally retained rather than deleting accounting evidence; session revoked. Prior cleanup transaction rolled back on FK, no partial deletion claimed.
- Daily encrypted schema backup timer at03:30UTC with randomized delay; service manual start Result=success/ExecMainStatus=0. Retains7 own daily archives; original release backups untouched. Restore drill authenticated raw dump and restored10tables into new isolated pactra_restore_scheduled_backup_v2. PG17 transaction_timeout SET omitted for localPG16; first failed drill database retained, not destructively replaced.
- Hourly auth cleanup timer: max100 per sessions/challenges/challenge_limits, retain24h after expiry. Dry-run/delete/readback zero qualifying records; manual systemd run succeeded. No task/audit data cleanup.
- Testnet RPC from live GMT guidebook https://rpc.bohr.life chain968 verified. EIP1898 blockHash/requireCanonical eth_getCode works. Faucet/en/basic403 from VPS.
- Owner funded isolated testnet deployer0xa9ad5EeB9Ee87F265f4dc5DE333e52452A2fa677 with1BOT (confirmed eth_getBalance). Private key saved only in protected server secret store; not committed. No contract deployment at this checkpoint.
- Mainnet deployment/publishing/submission not performed. Runtime credential rotation and Azure/management-key rotation still unverified; do not silently revoke shared team credentials.

This checkpoint is operational evidence, not completion of contract/app integration review or public financial activation.
