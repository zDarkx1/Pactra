"use client";
import { useEffect } from "react";

/** Progressive enhancement: all content remains visible without JS or motion. */
export function LandingScroll() {
  useEffect(() => {
    let disposed = false;
    let revert: (() => void) | undefined;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let generation = 0;
    const setup = async () => {
      const current = ++generation;
      revert?.();
      revert = undefined;
      if (preference.matches) return;
      try {
        const [{ gsap }, { ScrollTrigger }] = await Promise.all([
          import("gsap"), import("gsap/ScrollTrigger"),
        ]);
        if (disposed || current !== generation || preference.matches) return;
        gsap.registerPlugin(ScrollTrigger);
        const root = document.getElementById("main-content");
        if (!root) return;
        const media = gsap.matchMedia();
        media.add("(prefers-reduced-motion: no-preference)", () => {
          const context = gsap.context(() => {
            const panel = root.querySelector<HTMLElement>('[data-testid="product-banner"]');
            if (panel) {
              // Transform only: no per-frame layout or WebGL canvas resize.
              gsap.fromTo(panel, { scale: 0.94, transformOrigin: "center center" }, {
                scale: 1, ease: "none",
                scrollTrigger: { trigger: panel, start: "top 85%", end: "top 15%", scrub: 0.5 },
              });
            }
            root.querySelectorAll<HTMLElement>("#capabilities li, #principles > div, #journal > a").forEach((element) => {
              // Never hide readable content or focusable controls behind opacity.
              if (element.getBoundingClientRect().top < window.innerHeight * 0.9) return;
              gsap.from(element, {
                y: 24, duration: 0.7, ease: "power2.out",
                scrollTrigger: { trigger: element, start: "top 92%", once: true },
              });
            });
          }, root);
          return () => context.revert();
        });
        revert = () => media.revert();
      } catch {
        // A failed optional chunk must never break navigation or reading.
        revert?.();
      }
    };
    void setup();
    preference.addEventListener("change", setup);
    return () => {
      disposed = true;
      generation++;
      preference.removeEventListener("change", setup);
      revert?.();
    };
  }, []);
  return null;
}
