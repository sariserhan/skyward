# Browser regression checks

Run `npm run test:browser`. This builds the app and runs deterministic Chromium checks using Python Playwright. Set `SKYWARD_QA_PYTHON` if Playwright is installed in a virtual environment. The interpreter must have `playwright` installed and its Chromium browser available (`python -m playwright install chromium`). No dependencies are installed by the test runner.

The suite starts and stops its own server on a free loopback port. It never touches port 8000 or calls the live aircraft provider. Fixtures cover combined search/history, stale filtering, moving loaded models, slow-model fallback/retry, route fitting/units/endpoints/cleanup, desktop/mobile tool layout, and honest signal-loss holds. Unexpected browser errors fail the run. Screenshots and server logs go to a temporary directory printed at completion; set `SKYWARD_QA_ARTIFACTS` to choose another directory outside the source tree.

This is Chromium/WebGL coverage, not a claim of Safari/Firefox or real-device GPU compatibility. A software renderer is used in headless environments. Run `npm test` separately for the unit tests.

`npm run test:soak` runs the new customer flows and an accelerated reliability pass:
comparison, camera release/resume, mobile sheet dragging, airport-scoped replay,
provider failures, filter/empty/stale states, and 61 browser update cycles spanning
six simulated hours. It writes heap/entity/DOM samples to `soak-metrics.json` in the
external artifact directory. It uses Chromium DevTools garbage collection before
heap samples; the guard is less than 64 MiB retained JS-heap growth and fewer than
1,000 added DOM nodes from hour 1 to hour 6, with at most 240 traffic entities in
this fixture. GPU memory is not measured. This is not a six-hour wall-clock test.
The unit suite separately feeds 600 aircraft every 35 simulated seconds for six
hours and asserts the 4,000-aircraft / 32-fix motion retention limits throughout.

`npm run test:views` runs a five-minute wall-clock lifecycle check with fixture
traffic. It repeatedly enters and exits tower and cockpit views, starts and closes
spatial audio, checks auto-director manual override, altitude filtering, a mobile
radar layout, and a downloaded diagnostic snapshot. Each cycle samples retained
JS heap, DOM nodes, data sources, and open AudioContexts. All tower audio contexts
must close on exit; heap growth after warm-up must stay below 64 MiB. Results go
to `view-soak.json`. `SKYWARD_VIEW_SOAK_SECONDS` can override the duration (at least
three cycles always run). This measures browser lifecycle behavior, not perceived
audio quality or real-device GPU performance.

`npm run test:customer` checks one-click discovery, My flights/favorites/resume,
flight-scene sharing and PNG export, notification opt-in, ground activity,
recorded-session scrubbing and camera angles, and the illustrative Premium
preview. It covers desktop (1440×1000) and mobile (390×844) layouts and keyboard
activation/Escape. Preview interactions must make no billing or premium-detail
requests. Screenshots and the exported image stay in the external artifact folder.

`npm run test:launch` combines unit/server checks, the core browser regression,
and customer-flow checks. Unit/server coverage includes premium and simulator
access enforcement, spending limits, and stopping/restarting an isolated server on
the same port. Payment and flight data fixtures make no real purchases or paid
provider calls. This is a local validation gate, not certification of a live billing
setup or all browsers/devices; accounts and payments still remain test-only.

`npm run test:landing` checks a low airborne observation already past the normal
runway touchdown marker at IAD. It verifies sourced-model gear through an actual
Cesium scene pick, then advances the fixture clock through rollout and mapped
taxiing. Unit tests also cover barometric elevation offsets, missing route results,
heading/speed derived from history, go-arounds, and exits behind a late touchdown.
Gear deployment and the landing/taxi path are illustrative, not reported gear state
or a confirmed runway/gate assignment. No live aviation API is needed.

Weather rendering: `npm run test:weather` checks report-driven globe clouds, changing aircraft attitude inside a storm layer, and cockpit rendering with deterministic weather fixtures. Screenshots are saved in the printed evidence directory. Set `SKYWARD_QA_PYTHON` if Playwright is in a virtual environment.

Globe clouds illustrate recent nearby station observations, not satellite imagery or coverage over unreported oceans. Cloud thickness, shapes and turbulence are visual approximations. Weather motion does not change live positions, tracks or reported instrument readings; it is suppressed on the ground and with reduced motion, and can be disabled in Weather settings.

Cockpit recovery: `npm run test:cockpit` verifies cockpit opening with the former deferred-module URL blocked, then injects an audio startup effect failure to check that only the cockpit recovers. It exercises retry, return to side view, and the mobile recovery layout.

Multi-stop arrival regression: `SKYWARD_LANDING_MULTISTOP=1 npm run test:landing` uses an illustrative A319 approach at IAD with the ATL → IAD → CLE route returned for UAL2131. It checks rendered landing gear, runway containment, mapped taxi, and cockpit handoff; the approach positions are test fixtures, not a recorded flight.

`npm run test:architecture` verifies server-rendered airport discovery, mobile
layout, standalone account loading without the globe engine, authenticated
operational metrics, callsign deep links and the cockpit after its camera-loop
refactor. It uses an isolated server, an in-memory test account database and
fixture aircraft. A fixed test-only metrics token is scoped to that process.

## Repeatable visual and readiness checks

- `npm run test:visual` captures daylight, sunset and rain flight views with a
  deliberately delayed model response, then exercises night landing and taxi.
  Screenshots and `visual-frame-times.json` are saved outside the repository.
  Frame timings are observations, not a passing performance threshold.
- `npm run test:scenery` uses deterministic city-building fixtures to check
  fade-in, departure cleanup, mapped airport bridges and distance culling.
- `npm run test:account-recovery` checks a failed account load and retry,
  password-reset request, expired reset link, URL token cleanup and mobile layout.
  Requests are mocked; no email is sent and no production account is modified.
- `node scripts/browser-tests.mjs --recording-premium` checks recording access,
  subscription loss and absence of free-user account-library writes.

The shared harness accepts `SKYWARD_QA_BROWSER=chromium|firefox|webkit` when that
Playwright browser is installed. Chromium is the default. A missing engine fails
rather than silently substituting another browser. WebKit testing is not a claim
of testing Safari on physical Apple hardware. Physical devices, real network
conditions and the Neon integration remain separate checks.

The release runner includes these new flows. Review the
[customer readiness matrix](../../../docs/customer-readiness.md) before release.

`npm run test:performance` exercises opt-in recording, cancellation, closing the
monitor while exploring, reopening it, JSON download and sound-mix persistence.
The recording uses real browser timing, not a shortened test-only duration.
`npm run test:devices` runs recovery, Premium, performance and landing flows across
installed Chromium/Firefox/WebKit and writes an explicit release matrix. Limit it
with `npm run test:devices -- --browser=chromium`. Missing engines are BLOCKED and
produce a nonzero exit status. No browsers are installed automatically.
