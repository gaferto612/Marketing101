# Marketing101 maintenance

For every application change, review `public/user-manual.js` against the final behavior. Update affected instructions and the `reviewedOn` date. Do not describe planned features as available. Preserve the distinction between the Pages browser demo and authenticated server mode, and between simulated delivery and actual results.

After reviewing, run `npm run manual:reviewed` and commit `docs/user-manual-review.json` with the implementation and guide. If a change does not affect user instructions, explain that in the PR instead of making an unrelated text change. `npm run manual:check` must pass; it detects application changes but cannot prove the guide's accuracy. Never regenerate the manifest merely to silence a failure without review.

Verify the manual's desktop/mobile navigation, standalone page, RTL layout and Pages packaging when changing it. Do not commit generated builds or browser test output.
