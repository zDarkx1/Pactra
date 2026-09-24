# Landing scroll motion

GSAP3.15.0 + ScrollTrigger are dynamically imported only by the landing enhancement, after checking reduced motion. No additional React Bits dependency. The fiber panel expands from scale0.94 to1 over its viewport travel; this is a transform rather than width/height animation, so the WebGL canvas is not resized each frame. Workflow rows, principle columns and journal feature get a one-time24px entrance translation. Content opacity stays readable, with no pinning, scroll interception, smoothing replacement or autoplay timeline.

GSAP context/matchMedia revert on preference change and unmount. Async generation/disposal guards stop stale imports after navigation. The page is fully visible if the chunk fails or JS is absent. Styling remains Tailwind; GSAP owns only temporary transform values.

Verified in Chromium: mobile scroll scale0.9512→0.9994, no pin spacers or horizontal overflow, live reduced-motion reset, navigation to article and back without page errors. Unit tests/typecheck/build pass. This is functional testing, not a low-end-device FPS guarantee.

Removed the hero eyebrow “A shared starting point” and its meta-description phrase.
