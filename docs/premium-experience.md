# Premium journey and watching tools

Open **Account → Premium tools**. Local development Premium access continues to work without purchasing a subscription. Production entitlement checks still apply server-side. No provider key, payment mode, subscription price or spending limit was changed by this release.

| Capability | Entry point and actual behavior |
| --- | --- |
| Follow my trip | Travel accepts ICAO callsign and departure date without requiring an aircraft hex. Optional origin/destination stay user-entered. Monitoring and status notifications reuse the existing bounded pipeline. |
| Family tracking | Family stores up to ten private labels linked to saved journeys, enables monitoring, and creates 24-hour recipient links. Recipients need no account. Links can be revoked under Sharing; labels, account email and other journeys are excluded. |
| Cinematic replay | Explore tools → Sessions → replay a local recording. Highlights seek to continuous ground/airborne flag transitions. Selecting an aircraft enables a single detailed 3D model with side/bird cameras. Video export records the visible globe for 10, 20 or 30 seconds on the device, including map attribution, without account overlays or audio. |
| Flight passport | Logbook distinguishes self-reported flown and watched trips. Passport displays an orthographic route globe, airport/model collections, distance and time totals, year filters and an SVG recap download. Old logbook entries count as flown; users can remove/re-enter an incorrectly classified entry. |
| Where is my aircraft? | Family checks the saved flight's verified assignment against verified preceding journeys in that account. A candidate must use the same hex and arrive at the departure airport within the previous day. Missing evidence stays unavailable; an overlap is a warning, not a predicted departure delay or a guarantee about aircraft rotation. |
| Spotter alerts | Up to ten rules match type, registration or ICAO airline prefix within 10/25/50 nm of an airport. Approaching additionally requires consecutive fresh fixes moving closer and descending. Uses only observations already in the server's feed caches; it never fans out tracking calls or invents special-livery data. Matches appear in a 30-event inbox and may use the configured push outbox. |
| Watch together | A Premium host creates a private room with guest invite and separate authenticated host view. Selected aircraft and globe camera update every ten seconds; guests can pause following and send three fixed reactions. Guests use their own available tracking coverage. This is camera/selection sharing, not video or cockpit-state streaming. |
| Airport live desk | Saved airport dashboards show weather, runway geometry and traffic grouped into inferred approaches, inferred departures, reported ground and other observations, with links to aircraft and tower views. These are not a complete airport schedule. |

## Availability boundaries

Account flight-detail lookups and background monitoring remain **synthetic test mode**. This release does not enable live commercial flight-status requests or live billing. A configured, authorized status adapter is still needed before actual delay/gate/arrival monitoring can be offered. The existing verified-check entry point is server-only; clients cannot inject flight statuses or alerts. Device push delivery needs VAPID configuration and permission. Test details never become real flight alerts.

The inbound tool does not query an airline's full rotation history. It uses positive evidence in the user's saved, verified journeys and explains when no candidate exists. There is no complete arrivals/departures schedule connector or reliable special-livery feed. Premium copy explicitly avoids promising real-time aircraft everywhere.

Recorded ground transitions are inferred events, not verified runway operations. Replay interpolation preserves gaps exceeding two minutes. Clips require MediaRecorder/canvas capture support and exportable imagery; cancellation/unmount stops capture, and failures suggest Atlas or the original session file. No videos are uploaded to SQL or object storage.

## Costs, retention and deployment

- Existing 512 KB account-library cap and 100-entry logbook cap remain; passport adds only a compact experience flag. Replays remain local under existing recording limits.
- Family: 10 compact pointers per account. Spotter: 10 rules, at most 32 retained aircraft states per rule, six-hour deduplication and 30 recent events. Stale spotter state expires within a day when evaluated; removing a rule removes its state.
- Background journey monitoring retains the existing 30 monthly attempts, at most ten monitors, 15-minute interval and date window. It also consumes the existing shared test lookup budget. No additional paid API polling was introduced.
- Watch rooms are memory-only: two per host, 100 per server, two-hour expiry, at most 12 reactions; incoming state is allowlisted and throttled. All rooms end on restart. Raw guest tokens are not stored, and access logs redact room-token endpoints.
- Rooms require a single long-running server instance or sticky routing. Before distributing this across Cloudflare instances, move room state to a bounded shared ephemeral service (for example Durable Objects) with explicit quota review. SQL persistence is deliberately not used for ten-second camera updates.
- Recipients can see the shared room camera and selected aircraft, not host account data. End a room to revoke its guest token. Losing Premium also prevents further guest access.

## Validation

Focused Node tests cover owner isolation, Premium denial, caps, post-downgrade removal, room state validation/expiry/revocation, fresh real-observation matching and deduplication, inbound identity/route constraints, yearly passport totals and replay gap handling. Existing membership, monitoring and recording tests also run. Browser QA uses isolated local servers and synthetic tracking fixtures; it makes no paid flight calls or actual push/email delivery.

Validated on 2026-09-29: `npm test` passed 414 tests with one Neon integration test skipped (no test database configured). `npm run build` passed. Playwright Chromium checks at 1440×1000 and 390×844 passed flight/date entry without hex, family monitoring/link creation, unavailable inbound evidence, watched-flight passport/SVG export, spotter CRUD, room expiry/revocation, and responsive layout. A separate host/guest browser flow exercised camera following, pause, reactions and leaving. A real browser MediaRecorder export produced a non-empty replay video; highlight seeking, 3D model selection and replay cleanup passed. Browser plugin was unavailable, so the existing Playwright harness was used. Live provider delivery, actual push delivery, Safari/Firefox video export and a deployed multi-instance environment were not tested.
