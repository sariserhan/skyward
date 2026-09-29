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
