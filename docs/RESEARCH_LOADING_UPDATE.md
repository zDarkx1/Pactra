# Research and loading update

Primary-source rationale is in RESEARCH_EVIDENCE.md, with verified verbatim evidence from NYC DCWP, W3C Internationalization and NIST AI600-1. The journal uses separate E1–E3 citations for external rationale and retains internal source links only for implementation/status claims. No efficacy, market-size, legal-compliance or audit claim is inferred from these sources.

HeadingEntrance performs a short GSAP y/opacity entrance only on visible headings after hydration; cleanup and preference-change guards restore styles. Text remains server-rendered and never starts fully hidden. Reduced motion skips import/animation. Both landing and article use it.

LazyEvidence loads the interactive checker sample module only within240px of the viewport, with a reserved360px area, retry button and full-checker link. Article text is not lazy loaded. Existing GhostFibers defers OGL work until visible. No blanket native image lazy attribute was added because the landing's imagery is CSS/WebGL, not raster images.

Verified: citation ledger evidence gate; full unit suite/typecheck/build/docs; browser proximity waiting→ready and real Go checker; external source anchors; article desktop/mobile; reduced-motion static headings. Device-specific FPS/bandwidth benchmarks are not claimed.
