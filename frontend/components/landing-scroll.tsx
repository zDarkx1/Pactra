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
          import("gsap"),
          import("gsap/ScrollTrigger"),
        ]);
        if (disposed || current !== generation || preference.matches) return;
        gsap.registerPlugin(ScrollTrigger);
        const root = document.getElementById("main-content");
        if (!root) return;
        const media = gsap.matchMedia();
        media.add(
          {
            motion: "(prefers-reduced-motion: no-preference)",
            desktop: "(min-width: 1024px)",
            mobile: "(max-width: 1023px)",
          },
          (mediaContext) => {
            if (!mediaContext.conditions?.motion) return;
            const context = gsap.context(() => {
              const scene = root.querySelector<HTMLElement>(
                "[data-expand-scene]",
              );
              const stage = root.querySelector<HTMLElement>(
                "[data-expand-stage]",
              );
              const panel = root.querySelector<HTMLElement>(
                '[data-testid="product-banner"]',
              );
              if (scene && stage && panel) {
                const desktop = window.innerWidth >= 1024;
                // Native sticky scene; no wheel/touch interception, no GSAP pin spacer.
                gsap.set(scene, { height: "200svh" });
                gsap.set(stage, { position: "sticky" });
                const timeline = gsap.timeline({
                  scrollTrigger: {
                    trigger: scene,
                    start: "top top",
                    end: "bottom bottom",
                    scrub: 0.35,
                    invalidateOnRefresh: true,
                  },
                });
                timeline.fromTo(
                  panel,
                  {
                    clipPath: desktop
                      ? "inset(12% 6% 12% 53% round 100px 16px 16px 16px)"
                      : "inset(12% 6% 12% 6% round 64px 16px 16px 16px)",
                  },
                  {
                    clipPath: "inset(0% 0% 0% 0% round 0px 0px 0px 0px)",
                    duration: 0.72,
                    ease: "power2.inOut",
                  },
                  0,
                );
                timeline.fromTo(
                  "[data-expand-copy]",
                  {
                    x: desktop ? window.innerWidth * 0.235 : 0,
                    scale: desktop ? 0.72 : 0.85,
                  },
                  { x: 0, scale: 1, duration: 0.72, ease: "power2.inOut" },
                  0,
                );
                timeline.to(
                  "[data-expand-intro]",
                  { x: -70, opacity: 0, duration: 0.38 },
                  0,
                );
                timeline.fromTo(
                  "[data-expand-detail]",
                  { y: 20, opacity: 0.8 },
                  { y: 0, opacity: 1, duration: 0.35 },
                  0.4,
                );
                timeline.to(
                  "[data-expand-progress]",
                  { scaleX: 1, duration: 1, ease: "none" },
                  0,
                );
              }
              root
                .querySelectorAll<HTMLElement>(
                  "#capabilities li, #principles > div, #journal > a",
                )
                .forEach((element) => {
                  // Never hide readable content or focusable controls behind opacity.
                  if (
                    element.getBoundingClientRect().top <
                    window.innerHeight * 0.9
                  )
                    return;
                  gsap.from(element, {
                    y: 24,
                    duration: 0.7,
                    ease: "power2.out",
                    scrollTrigger: {
                      trigger: element,
                      start: "top 92%",
                      once: true,
                    },
                  });
                });
            }, root);
            return () => context.revert();
          },
        );
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
