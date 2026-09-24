# Dependency remediation

At the start of this pass `npm audit` reported 24 advisories (23 moderate, one high). The high ws advisory and vulnerable nested uuid versions were resolved by tested root overrides `ws:8.21.3` and `uuid:11.1.1`. WalletConnect's older nested utilities retained vulnerable query-string/decode-uri-component; overriding `@walletconnect/utils` to `2.25.0` removes that old dependency path without forcing an unsupported wagmi major upgrade beneath RainbowKit2.

After `npm update`, both full and production-only npm audit reports returned zero known vulnerabilities. This is registry advisory evidence, not a security guarantee. Runtime wallet compatibility still requires integration/browser testing; no claim of device or WalletConnect QR verification follows from an audit result. Parent runs build/typecheck and authenticated injected-wallet E2E before release. Source/lockfile changes must stay together and clean npm ci must be verified.

No `npm audit fix --force` or fabricated clean report was used.
