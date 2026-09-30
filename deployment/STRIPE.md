# Skyward annual Premium

## Product and price

Create one product named **Skyward Premium**, with one **recurring yearly** price. Recommended launch price: **USD 59.99 per year**, paid upfront and renewed annually until canceled. This is a pricing hypothesis, not an established willingness-to-pay or profit result. There is no monthly plan, lifetime purchase, free paid trial or automatic paid overage. The public free globe/demo remains available. Do not create a Payment Link: the app creates an embedded Checkout Session for the signed-in user.

Price, currency and interval shown in the app come from Stripe. The backend rejects inactive prices, nonannual intervals, zero-price plans, mode mismatches and unconfigured plan names. Supported display currencies initially: USD, EUR, GBP, CAD, AUD and CHF. Confirm applicable taxes and registrations separately; this change does not enable Stripe Tax or establish where tax must be collected. Set your actual annual amount in Stripe; 59.99 is not hardcoded into checkout.

At an illustrative US domestic card rate of 2.9% + $0.30 plus 0.7% Billing, $59.99 leaves approximately $57.53/year ($4.79/month) before tax, data, hosting, support, refunds and other charges. Your account country, payment method and contract can change fees. Sources checked September 30, 2026: https://stripe.com/pricing and https://stripe.com/billing/pricing.

The default paid-data allowance is 100 requests/user/calendar month, with a separate 1,000 request/month service cap and configured spend cap. Annual payment does not remove monthly usage limits. The global cap covers only ten users if every user consumes all 100 requests: review funded capacity before selling beyond a small pilot. At a hypothetical $0.01/request, full usage costs $1/user/month; at $0.05 it costs $5 and exceeds the illustrative monthly net revenue. These are sensitivity calculations, **not verified AirLabs rates**. Measure actual provider usage/caching and fixed-plan costs before promising capacity. Never advertise unlimited paid data or guaranteed coverage.

## Server settings

Set the following privately in `web/.dev.vars` for local Wrangler or Worker secrets/config for deployment. Node reads `web/.env` and `web/.env.local`.

```
SKYWARD_BILLING_MODE=test
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_PRICE_ANNUAL_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The existing `STRIPE_PRICE_ID` is a fallback alias for the annual price. Do not configure a monthly price there. Test keys and a test Price must belong to the same Stripe account. Keep secret keys and webhook secrets out of client bundles. The publishable key is returned to the browser only when checkout starts. Configure the Customer Portal for cancellation/payment-method updates, and upload the approved orbit mark plus Skyward business name/colors in Stripe branding. Do not switch live billing on until real test-mode Checkout, webhook delivery and account entitlement are verified on your deployment.

## Embedded checkout

Account → Upgrade → yearly plan → Stripe's embedded form on Skyward. Stripe.js is lazy-loaded only after a user selects the plan. No card details go to the Skyward server. Authentication or certain payment methods can still require a bank/Stripe redirect; the return URL is `/account/?checkout=return&session_id={CHECKOUT_SESSION_ID}`. It checks ownership and live/test mode before showing status, then confirms paid subscription access server-side. A URL parameter or client completion callback cannot grant Premium.

The integration uses Stripe.js `createEmbeddedCheckoutPage` and Checkout `ui_mode=embedded_page`, with `redirect_on_completion=if_required`. Existing compatible hosted clients are retained, but their configured price is also checked to be annual. An existing active/trialing/incomplete/past-due subscription directs the user to Manage subscription rather than selling a duplicate. An open matching embedded session is reused; obsolete Skyward embedded sessions are expired before starting a new one.

## Stripe webhook

Endpoint: **https://skyvvard.com/api/billing/webhook**. Register it only after deployment makes it publicly reachable. Use the API version pinned by the app: `2026-08-26.dahlia`.

Select:

- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- invoice.paid
- invoice.payment_failed
- invoice.payment_action_required
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted

Each test/live endpoint has its own signing secret. The handler verifies the signature over raw bytes with a five-minute timestamp tolerance, rejects wrong billing mode, and does not require browser cookies or an Origin header. It matches an existing customer mapping, queries current Stripe entitlement, and stores one bounded reconciliation record per account with the last 32 event IDs. It does not store card information or complete webhook payloads. Retries after failure remain possible; late events reconcile current Stripe state rather than blindly applying stale event data. Production D1 mutations run through the serialized coordinator. Account access still checks Stripe directly; the webhook record alone never grants access.

Unregistered customers and unrelated events are acknowledged without writes. Full/partial refunds, disputes and fraud warnings are **not automated access-revocation rules** in this implementation: review them in Stripe and manage the subscription under your policy. Stripe receipts and Stripe-managed billing emails are configured separately in its dashboard; Resend templates apply to Skyward-generated account mail.

## Verification before accepting money

Automated tests use fake Stripe responses and signed local fixtures. Browser tests mock the Stripe form boundary; they cannot certify actual payment-method behavior. With test credentials, complete a Stripe test-card payment, a decline, required authentication, a duplicate event, a cancellation and a payment-failure scenario. Confirm account access, secret mode separation, Customer Portal, accurate annual total/tax display and working webhook deliveries. No real charge or remote Stripe configuration is made by this repository change.

## Local sandbox verification — 2026-09-30

Run `npm --prefix web run check:stripe` for read-only validation of active local test
keys and the annual price. It refuses live keys and never prints credentials or
creates payment objects. The active local `STRIPE_PRICE_ANNUAL_ID` was corrected
from a product ID to its existing $59.99 USD/year test price. Commented live values
were left untouched; `.env.local` remains untracked.

Validation used a separate temporary SQLite database, loopback port 8793, test keys,
no development Premium bypass, and an example.invalid test account:

- Eleven checkout/webhook/D1 integration regression tests passed, including annual
  price validation, ownership, signature checks, duplicate events and reconciliation.
- A real Stripe sandbox embedded Checkout Session loaded through the local account
  screen with the correct yearly price and no JavaScript runtime errors.
- A real Stripe sandbox subscription paid using Stripe's test token became active;
  the local account endpoint granted Premium based on Stripe's state. Canceling the
  subscription removed Premium on the next account check.
- The test subscription was canceled, open Checkout Sessions expired, and the
  isolated Stripe customer deleted after testing. No live payment was attempted.
- Browser plugin was unavailable; Chromium Playwright was used. The embedded form
  displayed verification challenges, and the card interaction could not complete
  in the headless run. A successful browser Checkout submission, declined-card UI,
  3DS flow and Stripe-to-local webhook delivery remain unverified. The API-side
  subscription test is not a claim that browser Checkout completed.

Production configuration and deployment were not changed by these local tests.
