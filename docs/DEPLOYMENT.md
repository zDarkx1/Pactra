# Deployment plan — no deployment performed

Candidate topology: Next.js on Vercel, Go on a VPS/container host; future DB/object storage separate. This is a proposal, not permission to provision paid resources or reuse the TKM server configuration.

Next root-directory/workspace settings and standalone output must be verified with the chosen provider. GO_API_URL is server-only and must point to a reachable TLS-protected backend in production, not localhost. The current local starter does not configure domains or cloud env.

Go: build a Linux binary, run non-root under a supervisor, bind loopback behind TLS reverse proxy, inject process env, set CPU/memory/request limits and verify /ready. Future readiness must include required dependencies when added.

Before public release: rate limiting, error/log redaction, CORS/session policy review, auth before persistence, backups plus restore tests if state is introduced, rollback and client compatibility. No wallet/escrow release until settlement and security gates pass.

## Hackathon hosting caveat
The guidebook describes GitHub Pages/custom domain. Next server routes cannot run on static GitHub Pages. Confirm alternative hosting with organizers OR explicitly design a static export with browser-to-Go API/CORS and no Next BFF. This starter uses server routes; do not claim it can be uploaded unchanged to Pages.
