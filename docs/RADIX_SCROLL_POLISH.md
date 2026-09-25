# Radix and native-scroll polish

## Observed bug and regression

The previous expansion scene measured900px in server-rendered HTML, then1800px after optional GSAP loaded, on both1440px and390px screens. The extra viewport shifted all following content during hydration. The browser repro failed before the change and passed after reserving200svh through Tailwind's motion-safe styles in server markup, with CSS sticky rather than JS geometry mutation. This explains a real layout-jump path; it is not proof that every device-specific fast-scroll report shares one cause.

GSAP now changes visual transforms/clip paths only. Native wheel/touch scrolling is not intercepted, snapped, damped or replaced. Browser probes at1440/390/320px measured exactly1500px movement for1500px wheel input, no delayed scrolling once settled, no horizontal overflow and no pin spacers. Fullscreen expansion reaches viewport geometry, and live reduced-motion change releases sticky residence.

## Composition

- Retained the approved common-thread full-viewport scene.
- Replaced the generic workflow list with an illustrative paper stack: separate scope/evidence/decision sheets align as the reader progresses. This is explicitly an illustration, not fabricated customer data.
- Decision underline draws while its statement enters.
- Journal cover corner unfolds with scroll; article text and hit target stay readable and stationary.
- Hero workflow labels stack intentionally on narrow mobile, without stray separator dots.
- Excluded scene headings from competing entrance transforms.
- Reserved sample space based on actual loaded component measurements: around442px at1440,444px at640,525px at390,520px at320. Placeholder min-heights460/540px avoid late-content growth without an arbitrary full viewport gap.

## Accessibility and operational limits

Server text remains readable without GSAP; reduced motion disables visual timelines and extended sticky geometry. Native buttons preserve browser semantics; interactive workspace/nav widgets use Radix per the latest request. Tailwind and Phosphor are retained. Static no-JS sticky spacing remains reserved to avoid layout shift; it is not a Fullscreen API lock.

Supabase tables remain in private schema pactra, not public. No schema exposure changes were made. The user confirmed real arbiter addresses are not available; creation stays gated and the UI explains the missing operator configuration. No dummy arbiter, payment, account role or business data is introduced.

These measurements are functional browser checks, not a low-end-device FPS benchmark. Final integration/review/release evidence is separate from these targeted tests.
