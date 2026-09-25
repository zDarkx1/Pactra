# Radix workspace pass

Scope: workspace shell, native controls, wallet layout, task creation, shared task utilities, task-list spacing and owned tests. Radix is the accepted requirement, superseding older React Aria preferences. Tailwind and Phosphor remain.

## Implemented

- Actual `radix-ui` Dialog Root/Trigger/Portal/Overlay/Content/Title/Description for mobile workspace navigation. Radix owns focus trapping, background hiding and scroll locking. Pointer exit motion retains the modal until completion; keyboard and reduced-motion interactions settle immediately.
- Actual Radix Tooltip primitives wrap real Next anchors with `asChild` in the collapsed sidebar. Anchor hrefs, current-page semantics and modified-click behavior remain native.
- Button and ButtonLink use native buttons and Next anchors. There is no invented Radix Button import. Existing public props, native events, form values, pending labels and disabled behavior are retained. TaskButton defaults to type=button and still accepts the exact native attributes used by untouched task-detail/delivery-review consumers.
- Mobile wallet controls wrap inside their own available space instead of moving the menu into a conflicting row. Long account display names truncate while the accessible label retains the address. Controls retain 44px minimum height. Tablet breadcrumb density is reduced.
- Creation now has a real shared Radix confirmation, explicit unchecked acknowledgement, safe initial focus, once-only callback guard, and dismissal without sending when session/address/configured chain identity changes. Uncertain retries still reuse the retained intent directly; backend/idempotency logic is unchanged.
- The blocked creation panel is informative, not an error: “Agreement creation awaiting arbiter setup”. It asks the operator for two distinct real consenting team addresses, primary and backup, nonzero and distinct from participants, configured in matching frontend/backend PACTRA_ARBITERS allowlists. It links to the actual checker; the existing back link remains. Fields and submission remain gated.
- Task loading has a bounded surface; list result/pagination spacing is explicit and compact task rows/filters now apply through tablet widths. Existing list role filter is unchanged: it filters loaded agreements, not account privileges. No role selector, task count, dashboard metric, or data source was invented.

## Ownership boundary

This pass does not edit task-detail.tsx or delivery-review.tsx. Their existing acceptance/cancellation/review dialogs and consent behavior are not migrated by this pass. WorkspaceConfirmation is integrated into the owned task-form creation flow, not substituted into unowned consumers. Other owners may be changing those files concurrently.

No provider, session, transport, backend, package, landing, AGENTS or CLAUDE file was edited by this pass. No build, deploy, commit or push was run. /dashboard still redirects to /tasks.

## Verification

Initial Chromium capture of the real signed-out /dashboard redirect at 390, 768 and 1440px preceded edits. Initial/final PNGs and DOM geometry live in:

/root/.hermes/output/pactra-polish/dashboard/

Owned SSR/unit checks:

    cd frontend
    node --experimental-strip-types --test tests/sidebar-aria.test.ts tests/tailwind-shell.test.ts tests/tailwind-surfaces.test.ts tests/radix-workspace.test.ts

Browser checks:

    PACTRA_BROWSER_QA=1 node --experimental-strip-types --test tests/radix-workspace.browser.test.ts

The browser suite uses only http://localhost:4099. It checks live shell geometry, real Radix modality, focus loops, Escape/backdrop dismissal, scroll lock, navigation focus, reduced motion, desktop resize cleanup, collapsed tooltip keyboard behavior and persisted collapse state.

For protected creation/consent and long-wallet layout only, the browser suite bundles the actual components into a temporary directory and serves them through Playwright interception at localhost:4099/__radix-test. Its provider and RainbowKit state are explicitly fake test context. No live API response is fabricated, no authentication is bypassed in application code, and no private task mutation is sent. Test-provider PNG names distinguish these from live screenshots. It verifies blocked form fields, non-error setup, checkbox gating/reset, one callback, identity dismissal, safe focus return, and wallet noncollision at all three widths.

TDD: the new tests initially failed for missing setup copy, missing TaskButton default type, and absent Radix confirmation; these pass after implementation. Browser harness issues (hidden trigger excluded from accessibility query and duplicated test context caused by mixed module types) were corrected; final suite passes.

Full frontend typecheck passes. Owned unit/SSR suite: 23 passed. Opt-in browser suite: 1 passed, with no live shell page errors. Actual auth E2E, populated list/detail browser flows, and other owners' dialog migration remain parent verification responsibilities. Screenshots were captured and DOM/geometry inspected; no separate image-viewing tool was available in this session.

## References

Fetched official Dialog and Tooltip docs during the pass:

- https://www.radix-ui.com/primitives/docs/components/dialog
- https://www.radix-ui.com/primitives/docs/components/tooltip

Also read installed Next 16.3.5 Link documentation before changing Next anchors.
