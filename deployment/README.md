# Production deployment

Skyward remains React/Vite with a persistent Node 24 service. Build once and serve
`web/dist` through the Node server. Do not use Vite's development or preview server
for production. Nothing in this directory automatically publishes or restarts it.

## One service behind HTTPS

1. Provision a service account named `skyward`, install Node 24 and Caddy, and put
   a tested checkout in `/opt/skyward`. Run `npm --prefix web ci` and
   `npm --prefix web run build` before switching releases.
2. Create `/opt/skyward/web/.local`, owned by `skyward`. It holds local account
   state when test accounts are explicitly selected; production accounts should
   use Neon. Keep the application code and assets read-only to the service.
3. Put real settings in `/etc/skyward.env` (root-owned, mode 600), using
   `web/.env.example` as the field reference. Set `SKYWARD_ACCOUNTS=neon`, real
   Neon URLs, Better Auth secret, SMTP settings, and `SKYWARD_PUBLIC_ORIGIN` to
   your exact HTTPS origin. Do not copy placeholder credentials. Never enable
   development Premium in production. Checkout is still test-only; this
   deployment does not turn on live billing.
4. Install `skyward.service`, adapting Node and directory paths if needed. The
   service listens only on loopback. Configure Caddy using the supplied example
   and your own domain. Set `SKYWARD_TRUST_LOOPBACK_PROXY=1` only with this topology;
   Caddy appends the real connecting address to X-Forwarded-For. Without opt-in,
   the application ignores that header.
5. Verify `/healthz` and `/readyz`, then the browser, account sign-in and one feed
   query. Both probes verify server/build readiness, **not** upstream coverage or
   database health. Keep the last tested release for rollback. SIGTERM drains
   existing requests and closes membership resources (10-second shutdown limit).

## Container alternative

From the repository root:

```sh
docker build -f deployment/Dockerfile -t skyward:local .
docker run --rm --name skyward --env-file /secure/skyward.env \
  -p 127.0.0.1:8000:8000 skyward:local
```

Secrets are excluded from the build context; supply them at runtime. The container
runs without root privileges. Use Neon for account persistence. The flight
simulator is included. The separate Godot **airport** simulation export must be
built separately and mounted read-only at `/app/dist/web` if you need that game;
this image does not invent or download a missing game build. Do not enable
loopback proxy trust for a Docker bridge peer; use an appropriately configured
front proxy/rate limiter if deploying that topology.

## Feed capacity and monitoring

- Keep **one Node process** initially. Each provider has its own serialized queue,
  cache, duplicate request sharing and cooldown. Worker replicas multiply upstream
  usage; a shared ingestion/cache layer is required before horizontal scaling.
- Successful empty feeds remain distinct from failures. Failed identical queries
  are suppressed for five seconds. Three consecutive network/5xx failures open a
  30-second provider cooldown; HTTP 429 respects the longer provider backoff.
  No failures are converted into new aircraft observations.
- Set `SKYWARD_METRICS_TOKEN` to a random secret of at least 24 characters. `GET
  /metrics` requires `Authorization: Bearer <token>` and returns aggregate request
  counts, status counts, latency, memory and per-provider cache/queue/error metrics.
  It never returns the provider key, passenger data, user identifiers or URL query
  strings. Metrics are in-memory and reset on restart. The token is never a URL
  parameter. Alert on repeated 5xx, exhausted provider cooldowns, growing queues
  and memory; don't equate a zero-aircraft region with a broken service.
- `SKYWARD_ACCESS_LOG=1` enables simple request logging. Keep private metrics behind
  your firewall/proxy as well as the token. Use external uptime checks and collect
  service logs with your host's monitoring system; none is provisioned here.
- Set the exact `SKYWARD_PUBLIC_ORIGIN` to enable canonical URLs and `/sitemap.xml`.
  Do not submit a localhost sitemap. Public airport pages show catalog facts only;
  callsign lookup pages are noindex until verified content is available.

## Release checks

Run `npm --prefix web test`, `npm --prefix web run build` and the browser
regressions before deployment. Verify that `/account/` loads without requesting
Cesium or the observatory module, `/airports/TAS/` renders with JavaScript disabled,
and the globe still opens a selected flight and cockpit. Container and systemd
examples must be smoke-tested on the deployment host before release.
