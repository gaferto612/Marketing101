# Marketing101

A personal campaign companion: describe a promotion, edit its plan and content, review the exact campaign, and run it through a clearly labeled demo integration.

## Free marketing workspace

### Audited strategy and workflow

**Strategy** saves a decision stage, objective, primary measurement, user-chosen target, period, budget, and hypothesis. Select **Use brief in campaign** to capture the goal; later brief edits do not change its existing snapshot. In **Results**, choose campaign/date filters to see scoped metrics, paired-data coverage, and reported outcomes versus the saved target. Targets are not forecasts, and manual reports are not attribution evidence.

Products include optional audience questions, a substantiated differentiator, and customer questions. Product edits reset related drafts to draft; source notices identify material needing review. Search/filter the library and load 20 cards at a time. Kit edits and saved-draft edits have independent buffers, including hidden/filter edits. Deletion is blocked with pending work, and explicit discard is available. Variation cycles through three local options for each objective.

The overview includes next steps, mobile navigation uses a destination selector, and **Reload workspace** retrieves current records after a revision conflict, confirming discard if needed. Logout clears private views and returns to sign-in mode. New server passwords preserve exact input; existing hashes remain compatible.

See [the audit and official-platform comparison](docs/AUDIT_2026-10-10.md) for findings, evidence, boundaries, and next priorities.

All of these tools run without paid APIs, AI subscriptions, marketing-account connections, or a required product website. The Pages version stores its records in this browser; the Node version stores them per authenticated account in SQLite.

| Area | Available now |
| --- | --- |
| Products | Product descriptions, audiences, actual offers, approved facts, calls to action, optional URLs, and brand colors |
| Content studio | Six local template formats: social post, ad copy, short video script, email, message, and landing-page copy; Arabic/English frames; awareness, launch, enquiries, or offer objectives; clear, friendly, or concise style |
| Saved drafts | Edit, copy, delete, mark ready, export CSV/text, and reuse a social/ad draft as the first piece in a campaign |
| Ad designer | Edit headline, supporting text, button, and color; download square 1080×1080, portrait 1080×1920, or landscape 1200×628 PNG graphics |
| Campaigns | Select a saved product, preserve its approved facts/link as a copy snapshot, export the saved campaign as CSV, or duplicate it as an unapproved draft |
| Calendar | Browse scheduled content by month and export `.ics` preparation reminders in UTC |
| Results | Log actual spend, impressions, clicks, leads, sales, and revenue manually; display CTR, cost per lead, and ROAS from paired measurements; export CSV |
| Backup & exports | Download brand/workspace/campaign-plan JSON, validate a backup before confirmation, and restore it with automatic mode disabled and all campaign plans unapproved |

Start with **Brand profile**, add a product under **Products**, then use **Content studio**. Save the kit, edit or mark drafts ready, and select **Use in campaign** on a saved social/ad draft. Other formats are preparation assets you export or use manually; they are not emailed, messaged, or published by this app. Your saved draft becomes the first campaign piece; review the remaining pieces separately. Campaign pieces are limited to 4,000 characters, while studio drafts allow 8,000.

Templates use your supplied information and do not research, fact-check, or translate product facts. Arabic/English changes the template framing; source descriptions and facts retain the language you entered. Local quality checks flag some absolute claims, placeholder text, or long content; these checks are advisory, not proof that a claim is valid. The designer makes simple text graphics, not AI photos. Generated kits should be reviewed before use. Links are optional; a contact call to action is used when no link is present. Simple Arabic campaign durations and Arabic digits for DKK/كرونة amounts are supported, with explicit follow-up fields for unrecognized values.

Manual **Results** are separate from simulated receipts. Missing measurements stay null; ratios use only reports containing both required measurements. Do not enter overlapping reports if you want totals to represent distinct periods. All monetary reports currently use DKK. Browser policy limits remain simulations, not a billing or security system.

Workspace limits: 250 products, drafts, manual reports, and strategy briefs per collection, and at most 2 MB of workspace JSON. Backup imports allow up to 3 MB and 250 campaign plans. Export and reduce old records when approaching limits. Backups contain plain marketing data, are not encrypted, and omit simulated jobs, receipts, and automation permission. Restoration replaces only your browser workspace or authenticated account's records; the Node version assigns new campaign IDs to avoid collisions. Every restored or duplicated campaign requires fresh review and approval. Workspace revision checks reject stale saves from other tabs. Existing Pages data migrates to the new workspace without discarding its campaigns.

## GitHub Pages browser demo

Open **https://gaferto612.github.io/Marketing101/** for the static browser demo. The Pages workflow builds an explicit allowlist of public assets into `.pages-dist/` and deploys it through GitHub Actions. Pages settings use **GitHub Actions** as the publishing source; leave **Custom domain** blank to use the default project URL. The deployment runs only from `main`, whose pull-request and CI protections remain enabled.

This version runs the campaign workflow entirely in your browser and saves brand/campaign data in local storage. It has **no account authentication or server**, never publishes to real accounts, and never spends money. Its scheduling is a browser simulation: the page must remain open; overdue pieces run when you reopen it. Data is specific to this browser/origin and clearing browser storage removes it. The Reset demo button deletes the local demo records. Client-side policy and budget checks are demonstrations, not security controls. Web Locks serialize local updates across tabs where supported.

The authenticated Node.js/SQLite application below remains available separately for a server deployment. It enforces its approvals and limits on the backend and has a separate background worker. GitHub Pages cannot host that server process.

To preview exactly what Pages publishes:

```sh
npm run build:pages
node tools/preview-pages.mjs
```

Open `http://127.0.0.1:3102/Marketing101/`. This checks the same project-path asset URLs, rather than serving the app from `/`.

## Quick start

Requires **Node.js 24.14 or newer within the 24.x series**. The app has no third-party runtime dependencies. SQLite is built into Node.js; its API is still evolving, so the runtime is pinned to the tested major version.

```sh
git clone https://github.com/gaferto612/Marketing101.git
cd Marketing101
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

The **demo template planner is not an AI model**. It extracts simple English product/audience phrases, DKK amounts, and durations expressed as numbers or one/two/three/four days or weeks, plus simple Arabic durations and amounts. Unrecognized budget or duration values prompt for explicit fields. Product/audience extraction is heuristic: inspect and revise the request if the brief is wrong, or select a saved product. It generates three campaign variations using supplied product details and the first approved claim. Tone is saved in the campaign brief but these campaign templates do not reliably adapt style; the separate studio provides three simple style options. It does not browse websites, import their contents, create AI images, or invent testimonials or product outcomes.

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

The Node test suite covers parsing, approval invalidation, revision conflicts, account isolation, authentication/logout, CSRF/origin rejection, budget caps, automatic policy revocation/daily limits, pause/resume/cancel, adapter failures/retries, exact receipt content, and two independent workers sharing persisted jobs. It also tests the Pages artifact allowlist and the browser demo's persistence, approval, limits, and duplicate prevention. CI runs both commands on Node 24.16.0.

See `docs/VERIFICATION.md` for the observed test and browser results. No real-provider functionality is claimed or verified.

## User manual

Open **دليل الاستخدام / User manual** in the workspace navigation (also available on mobile), or open `manual.html` directly without signing in. The Arabic guide covers current features, demo limitations, approval, execution states, results and backup. Its print button opens the browser print dialog for paper or PDF output.

The shared guide source is `public/user-manual.js`. For each application change, update affected instructions and `reviewedOn`, then run `npm run manual:reviewed`. Commit the generated `docs/user-manual-review.json` with the change. `npm run manual:check` runs in required CI and Pages publishing and blocks unreviewed application changes. It checks file fingerprints, not instructional accuracy; review is still required. If instructions remain accurate after an internal change, record that conclusion in the PR. See `AGENTS.md` for the maintenance rule.

Browser validation: run `node tools/manual-smoke.mjs` against the Pages preview, with `PLAYWRIGHT_MODULE` and `TEST_BROWSER_CHANNEL` configured if needed. `TEST_ORIGIN` can point it at the published site.
