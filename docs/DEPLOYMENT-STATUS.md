# Cloudflare deployment status

Updated: 2026-10-06 (Asia/Taipei).

- Worker: `jev-model-router`
- Internal-test endpoint: https://router.tekuei.com
- Custom domain deployed and HTTPS `/api/health` verified with HTTP 200.
- `workers.dev` and preview URLs are disabled after custom-domain deployment. Attempt to preserve those additional public endpoints was blocked by the permission reviewer; no such re-enablement was executed.
- D1: `jev-model-router`, ID `51df88f5-5ee6-4ad3-a475-0ff56d44114d`
- Local and remote base schema plus `0001_skool.sql` applied successfully.
- Wrangler dry-run and initial deployment succeeded.
- Existing `tekuei-db` and website/domain routing were not modified.

`TYPESAFE_API_KEY`, `ADMIN_SYNC_SECRET`, and persistent `MEMBER_HASH_SECRET` are provisioned. Two synthetic live requests through the custom domain, authenticated membership session, D1 and TypeSafe returned HTTP 200: Chat `instant`, Work `luna`, each with top-three probabilities. Initial provisioning returned transient 503/401 during secret changes; a later retry with the same persisted administrator credential succeeded. The exact transient cause was not established. Do not rotate HMAC secrets on retries.

The extension now defaults to `https://router.tekuei.com`, with the confirmed Skool community link. Tests: 61 passed; `npm run check` passed. Real Chrome hosted-input flow still requires the operator test below. This is internal testing, not production-ready public login or automatic Skool subscription verification.

An operator-only test membership/session expires at **2026-10-07 01:47:20 Asia/Taipei** (2026-10-06T17:47:20Z). It is explicitly an internal entitlement, not verified Skool payment. Token and administrator credential are Windows-user-bound DPAPI ciphertext in ignored `.local/hosted-test-token.dpapi` and `.local/hosted-admin.dpapi`; no plaintext credentials were logged or committed. Keep the encrypted administrator credential for future authorized administration. The persistent HMAC secret lives in Cloudflare.

To test locally: reload the extension and refresh your ChatGPT tab manually. Run `scripts/copy-internal-test-token.ps1` in PowerShell 7 on this Windows account; paste the copied token into settings **Internal testing access**, turn off the personal-key option, save, and approve the domain permission. Clear the clipboard with the same script's `-Clear` switch. Type a short draft in Chat and Work and verify recommendation-only UI. Do not share the token or treat it as public login. Expired tokens need fresh authorized provisioning, not removal of expiry checks.

Next: finish public email ownership verification, Skool paid-status lifecycle synchronization and release safety checks. Never put plaintext secrets in this document, Git, chat, or extension source.
