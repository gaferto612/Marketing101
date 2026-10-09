# Marketing101

A personal campaign companion: describe a promotion, edit its plan and content, review the exact campaign, and run it through a clearly labeled demo integration.

## Quick start

Requires **Node.js 24.14 or newer within the 24.x series**. The app has no third-party runtime dependencies. SQLite is built into Node.js; its API is still evolving, so the runtime is pinned to the tested major version.

```sh
git clone https://github.com/gaferto612/Marketing101.git
cd Marketing101
# While the implementation pull request is unmerged:
git switch codex/marketing101-demo
# After merging, use main instead.
# Copy .env.example to .env if you need to change the defaults.
npm start
```

Open **http://127.0.0.1:3101**. Create an account with a password of at least 12 characters. Registration does not verify email or send email. This release has no password reset flow.

1. Save your business name, details, product, audience, tone, product link, and optional approved claims.
2. Describe a campaign, for example: “Promote my sales course to Danish small-business owners for two weeks, with a total budget of 1,000 DKK.”
3. Supply budget or duration if the parser cannot identify them. Product and audience fall back to your brand profile.
4. Edit content, links, allocations, and local dates. Save your changes.
5. For a quick demo, select **Schedule all pieces now for a quick demo**, then save. Otherwise the three pieces are spread across the requested duration, starting approximately one minute after creation.
6. Select **Review campaign**, review every piece, tick the review checkbox, and select **Approve & schedule**.
7. Watch the background worker deliver the simulated pieces. Inspect the immutable demo receipts and activity history. Refreshing or restarting preserves your data.

`npm start` starts the HTTP app and a separate child process for background jobs. Keep the app running for schedules to execute. Overdue jobs resume on restart; scheduled execution is not provided when your computer or process is stopped. You can run `npm run worker` as an additional supervised process; transactional locks prevent duplicate demo deliveries between workers. Use one HTTP instance and a local persistent database for this first release.

## What works

- Responsive overview, chat-style request form with missing-field follow-ups, brand profile, campaign editor, approval screen, automation policy, delivery receipts, and activity history.
- Server-side persistence in SQLite, account-specific queries, password hashes using salted scrypt, hashed session tokens in HttpOnly cookies, seven-day sessions, origin and CSRF checks, and account-attempt throttling.
- Draft → awaiting approval → scheduled → running → completed, with pause/resume, cancellation, and explicit retry after failure.
- Manual approval is tied to the exact saved revision. Edits invalidate review; approved campaigns cannot be changed in place. Stale editor revisions are rejected.
- Optional automatic approval only for explicitly permitted Demo workspace/product-promotion campaigns within a campaign limit. The UTC daily limit is checked across your account at execution; revoking the policy stops pending automatic jobs. Daily usage includes manual deliveries, but the daily restriction applies to automatic execution.
- Backend budget enforcement using integer minor units. Allocations cannot exceed the campaign cap. All spend and deliveries are simulated, and actual advertising spend is zero.
- Durable job queue with exponential retries (three attempts), transaction/savepoint rollback on partial failure, unique receipt keys, and duplicate prevention across processes.

## Deliberate first-release limits

The **demo template planner is not an AI model**. It extracts simple English product/audience phrases, DKK amounts, and durations expressed as numbers or one/two/three/four days or weeks. Unrecognized budget or duration values prompt for explicit fields. Product/audience extraction is heuristic: inspect and revise the request if the brief is wrong. It generates three variations using supplied product details and the first approved claim. Tone is saved in the brief but the templates do not reliably adapt style. It does not browse websites, import their contents, generate images, or invent testimonials or product outcomes.

The **demo integration never publishes to a real account or charges money**. Reach, clicks, and conversions remain unavailable, rather than displaying fabricated metrics. Social and paid-social channel suggestions are advisory. Accounts, currency (DKK), and campaign type are intentionally limited. Automatic adjustments are explicitly set to “none.” Cancellation retains completed receipts; it cannot undo already delivered activity. Budget failures stop the campaign instead of silently rescheduling or increasing limits.

## Real channel integration

No real channel has been selected or implemented. Choose Facebook/Instagram, Google Ads, LinkedIn, or an email provider before the next integration phase.

The local adapter contract is in `src/integrations.js`: `publish({ key, campaignId, item, now })` produces a receipt. The demo adapter is synchronous and shares the worker's SQLite transaction. A real network adapter needs a separate asynchronous execution path with durable leases/outbox records, provider idempotency keys or lookup/reconciliation, and explicit outcome states. **Do not call a remote publishing API inside the current SQLite write transaction.** A local transaction cannot guarantee exactly-once external side effects.

Before implementing a real provider, check its current official documentation and document:

- Required developer app, marketing/business account, and account ownership.
- OAuth permissions and any platform app review/approval.
- Server-only credential storage, token rotation, and account disconnection.
- Provider-specific publishing formats, rate limits, scheduling, and error recovery.
- Provider-side budget caps and reconciliation against actual spend, including in-flight charges and billing currency.
- Permissions and availability for verified performance metrics.

The demo's simulated allocation accounting is not an implementation of a real advertising platform's billing model.

## Configuration and deployment

See `.env.example`. Defaults bind to loopback on port 3101 and save data in `./data/marketing101.db`. `.env`, the database, and runtime data are ignored by Git. No credentials are required for the demo. Never commit provider credentials, brand/customer data, or database backups to this public repository.

For a hosted instance, use a Node 24 service with a **persistent local disk**, process supervision, and an HTTPS reverse proxy. This app is not compatible with a static-only host or an ephemeral/serverless filesystem. Production startup requires:

```env
NODE_ENV=production
APP_ORIGIN=https://your-marketing-domain.example
COOKIE_SECURE=true
REGISTRATION_CODE=a-long-private-invitation-code
```

Set `HOST=0.0.0.0` only when appropriate for the hosting environment; route traffic through the proxy. Use an exact APP_ORIGIN including scheme and port where relevant. The app ignores forwarded-IP headers for authentication throttling; configure additional rate limits at the proxy. Keep the SQLite file and backups access-restricted, on the same machine, and off public web paths. Back up SQLite using its backup facilities or with both processes stopped; copying only the main file during WAL writes can lose data. This first release has no email verification, MFA, password recovery, or automatic data-retention/deletion UI. It is intended for a personal workspace rather than a public multi-tenant service.

Imported website material, if added later, must be treated as untrusted source data, never instructions. The current release does not fetch submitted URLs, avoiding server-side URL-fetch risks.

## Validation

```sh
npm test
npm run check
```

The Node test suite covers parsing, approval invalidation, revision conflicts, account isolation, authentication/logout, CSRF/origin rejection, budget caps, automatic policy revocation/daily limits, pause/resume/cancel, adapter failures/retries, exact receipt content, and two independent workers sharing persisted jobs. CI runs both commands on Node 24.16.0.

See `docs/VERIFICATION.md` for the observed test and browser results. No real-provider functionality is claimed or verified.
