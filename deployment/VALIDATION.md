# Architecture change validation

Validated locally on 2026-09-29; no public deployment was performed.

- Node tests: 336 passed, 1 skipped. Includes failure suppression, provider
  cooldown, preserved cache timestamps, metrics authentication, trusted proxy
  boundaries, HTML escaping, airport lookup and canonical/sitemap behavior.
- Production Vite build passed. App, Globe, FlightSimulator, AccountPage,
  MembershipPanel and AccountWorkspace are distinct chunks. No chunk-size warning.
  This is bundle isolation evidence, not a measured frame-rate improvement.
- Playwright: public airport discovery and a 390×844 mobile viewport, account
  sign-in screen without Cesium/observatory downloads, health probes, protected
  metrics, callsign deep link and pilot cockpit passed. Existing globe regression
  passed for search, routes, moving models, mobile controls and outage motion.
- Simulator entry loaded separately without observatory chunks in development
  Premium mode. Flight physics were unchanged by this work.
- Docker image built, ran as non-root, served readiness/account/airport pages,
  and excluded `.env.local`. The temporary container was stopped and removed.
- Caddy TLS, systemd installation, production Neon/email configuration, external
  alert collection and the separately exported Godot game were not deployed or
  validated on a production host. Configure them using README.md before release.
