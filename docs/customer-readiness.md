# Customer readiness

This is a local validation record, not approval to deploy or enable live billing.

| Area | Local evidence | Remaining work |
| --- | --- | --- |
| Aircraft materials | Production build, served-model smoke check, material preservation tests, rendered flight | Inspect more aircraft/livery combinations on hardware |
| Weather and scenery | Daylight/sunset/rain screenshots; building fade and airport-detail fixtures | Diverse terrain, dense cities, slow real networks |
| Landing and taxi | Night watched-arrival regression; wheel inertia/compression tests | More airports, fleet variants and irregular live-feed sequences |
| Account recovery | Failed load retry, reset request, expired token and mobile UI with mocked API | End-to-end Neon, real SMTP and owned test-account recovery |
| Premium | Server unit/access checks; recording start, access loss and free-write prevention | Real payment-provider configuration and webhook operations |
| Browser/device support | Headless Chromium desktop/mobile viewports | Firefox/WebKit engines are not installed here; Safari/Firefox and physical phones are unverified |
| Performance | Visual tour records frame samples and entity counts | Software renderer was about 4–6 fps; hardware-GPU budget and long sessions remain unverified |
| Deployment | Existing local build/server and deployment instructions | No Cloudflare deployment, live billing or production rollout performed |

The test suite contains a Neon integration check that skips without
`SKYWARD_TEST_DATABASE_URL`. A skipped integration is not evidence of production
authentication/recovery working. Browser fixtures send no recovery email or paid
aviation requests. The visual tour uses synthetic positions and weather, not a
recorded commercial flight.

Before public release, run the same scenes on real desktop and mobile GPUs,
exercise cold caches and constrained networks, complete the existing Neon/Better
Auth integration test against a disposable database, and verify account recovery
through an owned mailbox. Keep development Premium disabled on public services.

## Repeatable device release matrix

Run from `web` (requires Python Playwright and the selected browsers installed):

```sh
SKYWARD_QA_PYTHON=/path/to/python npm run test:devices
# Or one engine:
SKYWARD_QA_PYTHON=/path/to/python npm run test:devices -- --browser=chromium
```

The runner checks account recovery, Premium recording access, opt-in performance
capture, and landing/cockpit flows. It records PASS, FAIL or BLOCKED per engine in
`release-matrix.json` under the printed artifact directory. Missing browser
engines fail the matrix rather than silently substituting Chromium. Mobile
viewports in these flows are emulation, not actual phone testing.

Before release, record the following on physical hardware. Do not check a row
based only on headless or emulated results:

| Device/browser | Globe/flight/cockpit | Landing + taxi | Audio + background resume | Recovery + Premium | 30s capture | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop Chrome, hardware GPU | — | — | — | — | — | Not tested |
| Desktop Firefox, hardware GPU | — | — | — | — | — | Not tested |
| macOS Safari | — | — | — | — | — | Not tested |
| iPhone Safari | — | — | — | — | — | Not tested |
| Android Chrome | — | — | — | — | — | Not tested |

Include OS/browser version, GPU/device, display size, network, aircraft/airport,
quality setting and artifact path with each result. Verify one dense city, rain,
night approach, aircraft switch, recovery after network interruption and return
from background. Set a real-device frame-time budget from these captures before
claiming a performance target. Neon/SMTP/live payment checks remain separate.

Latest local refinement evidence: production build passed; 385 unit checks passed,
with the Neon integration skipped. Chromium fixtures passed performance recording
(including closing/reopening the monitor), scenery streaming and runway material
rendering, weather audio lifecycle, a rendered fallback 787 flex rig, account
recovery, Premium recording access and watched landing/taxi. Firefox and WebKit
matrix probes returned BLOCKED because those engines are not installed. This does
not change the physical-device statuses above.

The cloud/water/handling refinement subsequently passed the production build and
395 unit checks (one Neon integration skipped). Software-rendered Chromium
fixtures exercised cumulus, stratus, cirrus-like and storm shader paths,
wind-responsive water with day/night transition, landing/taxi, and adaptive
resolution with watched-aircraft retention and manual override. Captured images
were visually inspected; these checks do not establish hardware-GPU frame rates
or MSFS-level fidelity.

Speech/continuity pass: production build passed; 400 unit tests passed and one optional database test was skipped. Isolated Chromium checks exercised turbulence-onset speech, tower readback, captain route updates, in-memory dialogue history/clear, all three sound presets and persisted slider values, cockpit entry/exit, and desktop/mobile layouts (1440×1000 and 390×844). No page errors or application error overlay occurred. Mobile screenshot was visually inspected. Browser speech was mocked for deterministic callbacks; audible voice quality and hardware-device audio remain manual checks. Unit tests cover overlapping speech ownership, missing completion callbacks, weather-loss recovery suppression and adaptive-resolution sampling gaps. No paid feed was needed.
