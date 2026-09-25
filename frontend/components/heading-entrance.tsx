"use client";
import { useEffect } from "react";
export function HeadingEntrance() {
  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let revert: (() => void) | undefined;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const start = async () => {
      const id = ++generation;
      revert?.();
      revert = undefined;
      if (preference.matches) return;
      try {
        const { gsap } = await import("gsap");
        if (disposed || id !== generation || preference.matches) return;
        const context = gsap.context(() => {
          const visible = [
            ...document.querySelectorAll<HTMLElement>("main h1, main h2"),
          ].filter((e) => {
            const r = e.getBoundingClientRect();
            return !e.closest("[data-expand-scene], [data-scope-story]") && r.top < innerHeight && r.bottom > 0;
          });
          gsap.fromTo(
            visible,
            { y: 18, opacity: 0.65 },
            {
              y: 0,
              opacity: 1,
              duration: 0.65,
              stagger: 0.08,
              ease: "power2.out",
              clearProps: "transform,opacity",
            },
          );
        });
        revert = () => context.revert();
      } catch {
        /* Optional enhancement; text stays readable. */
      }
    };
    void start();
    preference.addEventListener("change", start);
    return () => {
      disposed = true;
      generation++;
      preference.removeEventListener("change", start);
      revert?.();
    };
  }, []);
  return null;
}
