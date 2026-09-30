# Skyward on skyvvard.com

The product name remains **Skyward**. The canonical domain is **https://skyvvard.com** (two v characters). `www.skyvvard.com` redirects to the apex. The existing loading-screen orbit is the approved mark; the generated VV/W proposals were not applied.

## Prepared implementation

- React/Vite static assets, served by Workers Static Assets. Existing `/watch/` asset URLs are preserved; `/` is the observatory.
- A Worker routes public HTML, SEO, API requests and authenticated simulators.
- One SQLite-backed Durable Object coordinates provider queues, account transactions and usage checks. This intentionally starts as one bounded coordinator, not an untested horizontally scaled system. Password hashing happens here rather than in the front Worker; keep the secure Better Auth defaults.
- D1 stores Better Auth users, sessions, verification and rate-limit records, billing identifiers, bounded saves, journeys and Premium metadata. It does **not** store live position streams, models, music, or full replay recordings.
- R2 stores immutable releases of aircraft assets and the separate Godot airport game. Private game assets pass through the subscription check. The existing Aurowall library remains a separate integration; its credentials are not assumed to belong to Skyward's asset bucket.
- Better Auth with Resend handles account verification and password recovery. Five active sessions per account; daily bounded cleanup of expired sessions/tokens/rate limits and unverified accounts older than seven days.
- Existing account/Premium handlers are shared with the Node deployment. D1 application writes use atomic `batch()` commits after validation. All app writes must stay behind the same coordinator: direct second writers would invalidate the serialization assumption.
- Public contact page and email button target **contact@skyvvard.com**.

## Local checks (no deployment)

From `web/`:

```sh
npm ci
npm run build:cloudflare
npm run db:migrate:d1:local
npm run check:cloudflare
npm run dev:cloudflare
```

Open `http://localhost:8787`. Copy `.dev.vars.example` to `.dev.vars` for local settings. Without Resend and auth secrets, the globe/public pages work and accounts clearly report unavailable. Supplying a real Resend key can send real verification mail; automated tests inject a fake sender. Do not use live secrets for automated testing.

Model/game requests require R2 objects. The preparation step writes `.cloudflare/release.json` with the exact release, objects and hashes. Normal local Node development still serves bundled models directly and remains available with the existing start commands. `SKYWARD_ACCOUNTS=d1` is for the Worker, not `server/index.mjs`.

## Provision when ready

Nothing below was executed remotely during implementation.

1. Add `skyvvard.com` to your Cloudflare account and finish DNS activation. Keep the account on Workers Free unless you explicitly decide otherwise. Disable automatic paid upgrades; inspect account-wide usage, not just this project.
2. Create D1: `npx wrangler d1 create skyward-accounts`. Put the returned database ID in `wrangler.jsonc`. The all-zero ID is a deliberate placeholder, not a deployable production database.
3. Create a private Standard R2 bucket: `npx wrangler r2 bucket create skyward-assets`. Do not expose the private airport-game export through an `r2.dev` URL or public bucket domain.
4. Apply schema: `npx wrangler d1 migrations apply skyward-accounts --remote`. Back up first if reusing an existing database. This creates a fresh D1 schema; **existing Neon accounts and passwords are not automatically migrated**. Plan an export/import and reconciliation before switching an existing user base.
5. Set Worker secrets with `npx wrangler secret put BETTER_AUTH_SECRET` and `npx wrangler secret put RESEND_API_KEY`. Generate at least 32 random characters for the auth secret. Never put secrets in `VITE_*`, `wrangler.jsonc`, git or a chat message.
6. In Resend, verify `skyvvard.com` and install the exact SPF/DKIM records Resend provides. Set a suitable DMARC policy for your mail setup. The configured sender is `Skyward <contact@skyvvard.com>` and reply-to is `contact@skyvvard.com`; both can be overridden with server settings.
7. Separately provision **receiving** mail for `contact@skyvvard.com` using a mailbox provider or Cloudflare Email Routing to an inbox you control. Resend's sending API and the mailto button do not create an inbox. Do not replace your receiving MX records with sending-only records.
8. Build the Godot export into `dist/web` if shipping the airport simulator. The preparation step includes it when present. An absent game export is a release blocker for advertising that simulator as available.
9. Run `npm run build:cloudflare` and `npm run assets:r2:plan`. Review total R2 usage and retained releases. A release is capped at 4 GiB locally; keep only current and previous supported releases within the 8 GiB storage budget. Upload explicitly with `SKYWARD_R2_UPLOAD_APPROVED=1 node scripts/upload-cloudflare-assets.mjs --upload`. This may take time; an interrupted upload can be rerun. Set `SKYWARD_ASSET_RELEASE` in Wrangler to the generated release only after verifying the upload.
10. Run the checks below, then explicitly deploy with `npx wrangler deploy`. Custom-domain routes register the apex and www domain. Review Cloudflare's zone/DNS changes before publishing.

## Optional services and cost controls

Stripe and paid aviation remain in **test/demo mode** by default. Production payments, paid flight lookups, provider permissions and credentials require separate setup; free accounts cannot call the paid provider. Existing server-side entitlement and allowance checks remain enforced.

Static files bypass Worker execution where possible. Dynamic coordinator requests have a default 50,000/day admission ceiling. This is a service cap, **not a guarantee of zero cost or unlimited uptime**: rejected requests, R2 asset requests, CPU/duration, D1 rows/indexes and other applications also consume provider quotas. Free-plan platform limits can stop service sooner. Check Cloudflare billing and set alerts before launch. R2 storage/operation usage must include retained releases and other buckets; the uploader's explicit admission check does not remotely measure your whole account.

No cloud recording uploader, continuous D1 telemetry, or per-frame writes were added. Full replays remain local; saved account summaries retain their existing byte/count/revision limits. Provider queues are shared by the coordinator and keep original timestamps. Restarting/evicting the coordinator clears transient caches; it does not turn old observations into fresh ones.

The default cron is daily retention only. Before enabling automatic Premium monitoring in Cloudflare, set and measure an appropriate schedule and request/notification budget. Manual paid lookups and saved monitoring preferences use the existing handlers; unattended monitoring is not represented as running by this daily-cleanup configuration.

## Release verification

- `npm test`, `npm run build:cloudflare`, `npm run db:migrate:d1:local`, `npm run check:cloudflare`.
- Root and airport pages render, sitemap uses skyvvard.com, www redirects, unknown URLs return 404, and account/private pages have `noindex` and `no-store`.
- Fetch a model, texture and large byte range from the uploaded R2 release; check browser model loading. Confirm unpaid clients cannot fetch game assets or paid flight data.
- Verify a real Resend test account receives verification and reset mail, unverified sign-in is blocked, old sessions are revoked after reset, and contact mail reaches your inbox.
- Verify account ownership, save conflicts, billing test checkout, route/weather/feed behavior and both simulators. Validate sustained request counts, D1 reads/writes, CPU and R2 operations on a staging deployment before opening public signups widely.
- `/healthz` reports wiring status, **not** verified DNS, database migration state, email delivery or R2 object existence.

## Search setup

Canonical links, sitemap/robots, Open Graph/social card, Website/Organization data, Airport and breadcrumb structured data, public HTML airport pages and contact links are included. Accounts, private share links and unverified flight lookup pages are not search landing pages. Submit `https://skyvvard.com/sitemap.xml` through Search Console/Bing after deployment and verify domain ownership with their actual DNS tokens. No analytics, tracking pixels, fabricated reviews, rankings or unprovided legal business details were added.

Official references: [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/), [D1 batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Better Auth database](https://better-auth.com/docs/concepts/database), [Resend email API](https://resend.com/docs/api-reference/emails/send-email).

## Legal pages before launch

`/terms/` and `/privacy/` identify the operator as SSARI Inc., as supplied by the owner. They are linked from public page footers and account screens; signup shows policy links. Confirm the company's exact registered name, country, business/contact address, live billing/refund policy and provider retention arrangements before public launch. No jurisdiction, postal address or legal compliance certification has been invented. Review the text against the final deployed services and applicable laws. Provision the contact mailbox before directing customers to it.
