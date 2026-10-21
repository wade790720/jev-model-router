# Cloudflare deployment status

Updated: 2026-10-21 (Asia/Taipei).

- Worker: `jev-model-router`, custom domain https://router.tekuei.com (`workers.dev` and preview URLs disabled).
- D1: `jev-model-router`, ID `51df88f5-5ee6-4ad3-a475-0ff56d44114d`.
- Role: **error inbox only.** Since extension 0.5 there is no hosted service. The code for the hosted route, Skool sign-in, member provisioning and usage limits was removed from `worker/`; see [CLOUDFLARE-SKOOL.md](CLOUDFLARE-SKOOL.md) for the remaining routes.
- Not yet deployed: the deployed Worker still runs the previous code until the next `npx wrangler@latest deploy` in `worker/`. After deploying, `/api/health` should return `"service": "error-inbox"`.

## Secrets

Keep `ERRORS_ADMIN_SECRET` (the daily AI routine reads the inbox with it).

The code no longer reads these, so they can be deleted (listed only; nothing was deleted):

- `TYPESAFE_API_KEY`
- `MEMBER_HASH_SECRET`
- `ADMIN_SYNC_SECRET`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, if still present from 0.2

## Database

No tables were changed and no migration was added. The inbox uses `error_reports`. The old `members`, `member_sessions`, `usage_windows` and `licenses` tables remain untouched for a later decision.

Never put plaintext secrets in this document, Git, chat, or extension source.
