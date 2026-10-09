# Verification — 9 October 2026

## GitHub Pages remediation

The old branch-root/Jekyll publishing configuration did not package the application entry point from `public/`; its latest deployment ended with `Deployment cancelled`. The application's root-relative asset/API URLs also could not serve a functional app at `/Marketing101/` on a static host.

Added a dedicated Pages workflow that packages only public UI assets, uses relative project-path URLs, and selects an explicit browser-demo transport. The full Node/SQLite server remains separate and unchanged. The browser version has no account authentication, no server worker, and no real publishing/spending. Scheduling is simulated only while the page is open (overdue jobs resume when reopened), with records saved in local browser storage.

After this change, all **14** Node tests passed. The static artifact was served at `/Marketing101/`, and the isolated Chrome smoke test passed at desktop and mobile sizes through brand setup, missing-field follow-ups, regeneration/editing, exact approval, three simulated deliveries, reload persistence, automation rules, escaped script content, and reset. The artifact allowlist excludes server files, credentials, and runtime data. Deployment and the public URL are verified separately after merge.

Verified locally on Windows with Node.js 24.16.0 and an isolated headless Chrome browser. This is a working demo release, not a deployed production service or a verified real-account integration.

## Automated checks

- `npm test`: 11 tests passed.
- `npm run check`: server, engine, planner, and browser JavaScript syntax checks passed.
- Two separate Node worker processes sharing the same on-disk SQLite database produced three receipts exactly once and preserved the approved budget total. Reopening the database preserved completed status.
- Authentication journey covered registration, login, logout, cross-account isolation, origin rejection, CSRF rejection, revision conflict, exact delivery content, and missing-field follow-ups.
- Execution checks covered approval requirements, review invalidation on edit, over-allocation rejection, execution budget cap, policy revocation, UTC daily limit, pause/resume/cancel, partial adapter rollback, retry, and duplicate prevention.

## Browser checks

`tools/browser-smoke.mjs` passed against the real local HTTP app and background worker at desktop (1440 × 1050) and mobile (390 × 844) sizes. It exercised:

1. Account registration and brand profile save.
2. Campaign request missing budget and duration, followed by explicit answers.
3. Generation of the brief, content variations, schedule, and allocations.
4. Regeneration and editing of individual content, with unsaved edits preventing review.
5. Scheduling all pieces now for a quick demo, saving, reviewing, and explicit approval.
6. Three exact demo receipts, completed status, and activity history.
7. Reload persistence of the campaign and brand profile.
8. Explicit automatic-mode policy save and persistence.
9. Mobile overview, campaign, brand, composer, automation, and sign-in screens fitting their viewport without horizontal page overflow.
10. Mobile sign-out through a visible control.
11. Pasted script markup remained literal content and did not execute. No uncaught browser errors were observed.

Screenshots were generated in ignored `test-results/` and visually inspected. Test accounts and simulated data are stored only in the ignored local database, not in Git.

To repeat browser verification, provide Playwright and a browser separately (they are optional test dependencies). Install them in a development environment, or point `PLAYWRIGHT_MODULE` to an existing `playwright/index.mjs`. Set `TEST_BROWSER_CHANNEL=chrome` to use installed Chrome in an isolated headless session. Start the app, then run:

```sh
node tools/browser-smoke.mjs
```

The browser smoke script creates a disposable local account on each run and does not delete its records. Use a separate `DATABASE_PATH` for a dedicated testing instance if desired. `TEST_ORIGIN` overrides its default loopback URL. The HTTP server's `APP_ORIGIN` must match that URL.

## Not verified / next phase

No real advertising, social, email, OAuth, billing, image generation, LLM, platform approval, or provider metrics integration exists in this release. No production deployment or recovery-under-host-failure test was performed. The demo planner is intentionally heuristic and should not be described as a general natural-language AI agent.

Background execution is durable on disk but requires the app/worker processes to remain running. HTTPS proxy deployment, invitation-code configuration, backup/restore procedure, and provider-specific integration tests remain hosting/integration tasks.
