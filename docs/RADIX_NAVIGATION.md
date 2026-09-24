# Radix landing navigation

Scope: `frontend/components/landing-header.tsx` only for production code. Uses the installed `radix-ui` 1.6.7 package directly; does not change shared `ui.tsx` or its import contract. The explicit Radix direction supersedes the previous React Aria header implementation.

## Behavior and layout

- Mobile: controlled Radix Dialog with Trigger, Portal, Overlay, Content, Title, Description and Close. Radix owns modal focus trapping, outside/Escape dismissal, background accessibility and scroll locking.
- Full dynamic-viewport-height drawer, independent vertical scrolling, safe-area padding, sticky logo/close row, and a visible 16px backdrop strip. Controls and links have at least 44px targets. Product, Principles and Learn use real Radix Accordion primitives. The CTA pair remains below navigation and never shares the logo row.
- At 1024px the drawer unmounts, releasing Radix's scroll/pointer lock. Dismissal restores the hamburger with `preventScroll`; breakpoint dismissal restores the visible home link instead.
- Desktop: real Radix NavigationMenu Root/List/Item/Trigger/Content/Link. Three-column, viewport-wide editorial panels retain the existing summaries, descriptions, project-story tile, warm colors and destinations.
- Content remains inline within its item rather than moving through NavigationMenu.Viewport. The list's positioning wrapper is explicitly static so panels are positioned against the sticky header. This avoids transient viewport content/ref replacement during rapid keyboard interactions while retaining Radix pointer transit and keyboard behavior.
- Enter/Space toggles a desktop trigger; ArrowDown enters an open panel. Escape, outside pointer and focus departure dismiss it. A pending pointer-leave timer is ignored while a panel link owns focus; explicit dismissal still closes the panel. Escape focuses its trigger using `preventScroll`.
- No header GSAP or pinning. Small decorative CSS transitions honor reduced motion; modal unmount is immediate so no exit animation prolongs focus/scroll locks.

## Anchors and navigation

All original destinations remain unchanged, including the exact existing development-docs URL. Mobile also exposes the existing desktop Approach destination. No backend functionality was added.

Unmodified same-document anchor selection closes navigation and performs one intentional anchor scroll. Mobile does this from Dialog's close-autofocus callback, after the modal focus scope and scroll lock unmount. The target receives temporary `tabindex=-1` and focus with `preventScroll`, then `scrollIntoView` respects the page's scroll padding and reduced-motion preference. History is updated without dropping Next's existing history state. Temporary tabindex is removed on blur.

NavigationMenu.Link's selection default is prevented because its default dismissal focuses the trigger before navigation. Next Link still handles ordinary route navigation; modified/new-tab activations are left alone. Dialog close autofocus is suppressed for route changes rather than pulling focus back to a departing header.

## Reproduce

Use the parent's existing dev server. Do not run a shared `.next` build.

    cd /root/projects/pactra-polish
    NAV_BROWSER=1 node --experimental-strip-types --test --test-concurrency=1 frontend/tests/mega-menu.test.ts tests/radix-navigation.test.ts
    node scripts/polish-navigation.browser.mjs
    cd frontend && npm run typecheck

Optional script variables: `BASE_URL`, `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH`, `NAV_ARTIFACTS`. Defaults target `http://localhost:4099/` and the supplied research Playwright/Chromium installation. Without `NAV_BROWSER=1`, node tests only run the primitive-contract checks and explicitly skip browser cases. The standalone browser script always runs behavior checks.

Tests use actual browser interactions and DOM geometry, not only source regexes. Sticky hamburger clicks use viewport coordinates because Playwright locator auto-scroll can otherwise move the sticky element's original layout box before clicking. Desktop keyboard activation is exercised via Enter then ArrowDown (Radix's actual interaction model).

## Verified result

Final owned test run: 5 passed, 0 failed, 0 skipped. Standalone browser: all three scenarios passed. `npm run typecheck`: exit 0. `git diff --check`: exit 0.

Coverage: X/Escape/backdrop dismissal; forward/reverse focus wrapping; independent expanded-drawer scrolling; repeated preservation of page scroll; accessible title/description; minimum target sizes; all group destination hrefs; real checker route selection; principles/capabilities/release anchor landing and delayed-jump detection; desktop pointer transit, keyboard selection, focused-link persistence, outside/focus departure, click toggles; scrolled-menu Escape; desktop resize unlock; logo clearance at 1024px; horizontal overflow; normal and reduced motion.

Screenshots (captured, not a substitute for behavior assertions):

- `/root/pactra-nav-artifacts/mobile390-closed-reduce.png`
- `/root/pactra-nav-artifacts/mobile390-open-reduce.png`
- `/root/pactra-nav-artifacts/mobile320-closed-no-preference.png`
- `/root/pactra-nav-artifacts/mobile320-open-no-preference.png`
- `/root/pactra-nav-artifacts/desktop1440-mega.png`

Logs: `/root/pactra-nav-before.log`, `/root/pactra-nav-after.log`, `/root/pactra-nav-browser.log`, `/root/pactra-nav-typecheck.log`. The red run preceded implementation: both primitive requirements failed, desktop pointer transit failed, and mobile accessibility assertions failed. Node emits a harmless module-type warning for the root tests directory; no shared package metadata was changed to silence it.

Not claimed: a full shared frontend-suite result, production build, real-device Safari/notch testing, or backend/auth workflows. Parent owns page/motion acceptance and another agent owns workspace/shared UI. No commits, deploys or dependency changes were made by this work.
