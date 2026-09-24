# Verified BOT network configuration

Checked against official developer documentation and a live read-only RPC call on 2026-09-24 UTC:

- [Official RPC documentation](https://dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint/): mainnet chain ID677, RPC `https://rpc.botchain.ai`; testnet968, RPC `https://rpc.bohr.life`.
- [Official quick guide](https://dev-docs.botchain.ai/docs/Developers/quick-guide/): native token BOT and mainnet explorer `https://scan.botchain.ai`.
- Live `eth_chainId` to mainnet returned `0x2a5` (677). This was a read-only call, not a transaction or contract deployment.
- The official explorer's `/assets/envs.js` reports `NEXT_PUBLIC_NETWORK_CURRENCY_DECIMALS: "18"`, currency name and symbol BOT.

Public workspace wallet sign-in may use this configured network; signing the exact SIWE challenge does not send a blockchain transaction or establish funds. No WalletConnect project ID is fabricated. Without one, injected-wallet support is available; QR/mobile WalletConnect requires the team's own project configuration and real-device testing.

Mainnet official RPC documentation says `eth_getLogs` is disabled on the listed mainnet endpoint. Future contract indexers must verify a suitable provider; a successful `eth_chainId` does not establish event-indexing support.
