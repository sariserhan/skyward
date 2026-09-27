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
