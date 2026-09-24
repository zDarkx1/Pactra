# Landing and Tailwind migration

Branch: interface/anthropic-landing, based on interface/shell (90ee7cb). No backend/API/payment changes.

## Stack
Tailwind CSS4.3.3 with @tailwindcss/postcss4.3.3, Phosphor React2.1.10, React Aria Components1.21.1. Own component styling uses literal Tailwind utilities/typed utility maps. globals.css contains theme tokens, base element defaults, and global accessibility/reduced-motion rules only. All six CSS modules removed. Fonts and RainbowKit keep their vendor styles; WebGL necessarily sets canvas dimensions imperatively.

React Aria supplies base Button/Link, mobile Modal/Dialog and landing disclosures. Native semantic inputs remain where existing forms already work. No GSAP/Motion dependency was needed; existing Web Animations interactions remain, with reduced-motion handling. Icons replaced with Phosphor; not hand-drawn SVG.

## Original composition revision

The user subsequently requested a more original structure while retaining the editorial visual language. The active landing now uses an asymmetric headline/GhostFibers split hero, an ordered agreement narrative instead of three equal feature cards, an immediately visible real checker demo, a human-decision statement, and a compact footer. GhostFibers becomes the visual metaphor for a common thread. The earlier measurements below describe the previous commit18768cb, not the active layout; pixel parity is no longer the goal.

Verified the revised desktop side-by-side composition and mobile stacking in Chromium, plus visible sample without disclosure, no horizontal page overflow at1440/390px, shader pause/reduced-motion/fallback, navigation, and actual Go sample fail→pass at320px. Existing unit suite, typecheck, docs and production build pass. No business-flow changes. Re-run the layout regression with `BASE_URL=http://127.0.0.1:3799/ node scripts/landing-layout.browser.mjs` using a local Playwright installation; optional `PLAYWRIGHT_MODULE` points to its module and `CHROMIUM_PATH` selects an installed Chromium. This browser check is separate from CI's unit suite.

## Historical reference evidence and intentional differences
Inspected live anthropic.com desktop1440px and mobile390px, hover dropdown, mobile menu, card structure and typography. Live page differed from supplied Claude marketing analysis: heavy sans headline, serif supporting copy, large banner followed by cards and editorial resource list.

Measured banner at desktop: reference x77.73,y519.39,w1285,h633.89; Pactra x77.73,y519.73,w1284.53,h634. Mobile reference x32.5,y608.02,w325,h493.33; Pactra x32.59,y608.30,w324.81,h493. H1 origin aligns x77.73/y218.59 desktop and x32.59/y146.88 mobile. This is geometry matching, NOT a100% screenshot similarity score.

Pactra retains its own name/copy/routes and uses licensed open-source IBM Plex Sans/Newsreader, not proprietary Anthropic fonts/logo. Footer contains real Pactra destinations rather than fake corporate pages. Funding limitations remain visible. Existing landing sample remains accessible in a disclosure, preserving #try-a-check and #agreement anchors. These deliberate changes mean full-page height/content/font metrics differ.

## GhostFibers
User-supplied GLSL preserved and integrated with OGL. Lazy import when visible,30fps/DPR1 usage; cap DPR1.5. Offscreen/hidden/manual pause/reduced-motion stop animation. Unsupported WebGL2 or context loss retains a static background and working content. Resources/RAF/observers/listeners released on unmount. Explicit background pause/play control. Reduced motion uses CSS fallback rather than running a hidden animation.

## Verification
- Unit/contract suite, docs tests, TypeScript and Next production build exercised.
- Browser:1440/390 viewport geometry and no horizontal overflow; no pageerror; desktop dropdown hover/Escape; mixed-input focus retention; mobile disclosure/navigation; workspace RAC modal Escape; shader pause/play/reduced motion; forced getContext=null static fallback.
- Real local Go checker: original landing sample reports placeholder difference; corrected sample reports passed. No AI/provider calls, wallet signatures, real tasks or payments used in visual QA.
- Existing MetaMask SDK build warning about optional react-native async storage remains from base branch; build succeeds. No blanket claim of wallet/device compatibility from this preview.
- Browser harnesses and reference captures stored on development host /root/ui-research and /root/.hermes/output/pactra-landing; structural tests are not substitutes for browser testing.

Not merged or deployed. Wallet/task authenticated end-to-end behavior and actual-device GPU performance still require their own checks.
