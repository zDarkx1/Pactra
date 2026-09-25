"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from "react";
import Link from "next/link";
export function LazyEvidence() {
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (pending.current) return;
    pending.current = true;
    setFailed(false);
    try {
      const module = await import("./landing-evidence");
      if (mounted.current) setComponent(() => module.default);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      pending.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    if (!("IntersectionObserver" in window)) {
      void load();
      return () => {
        mounted.current = false;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          void load();
        }
      },
      { rootMargin: "240px" },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      mounted.current = false;
      observer.disconnect();
    };
  }, [load]);
  return (
    <div
      ref={root}
      data-lazy-evidence={Component ? "ready" : "waiting"}
      className="min-h-[540px] sm:min-h-[460px]"
    >
      {Component ? (
        <Component />
      ) : (
        <div className="flex min-h-[360px] flex-col justify-center gap-5">
          <p className="m-0 font-mono text-xs uppercase tracking-wider text-muted">
            Interactive sample
          </p>
          <p className="m-0 font-serif text-xl">
            A missing placeholder. An inspectable result.
          </p>
          <p className="m-0 text-sm text-muted">
            {failed
              ? "The sample could not load. Retry, or open the full checker."
              : "The sample loads as you approach this section."}
          </p>
          <button type="button"
            onClick={() => void load()}
            className="min-h-11 w-fit rounded-lg bg-ink px-4 text-sm text-canvas hover:bg-[#a9583e]"
          >
            Load interactive sample
          </button>
          <Link href="/checker" className="text-sm text-ink underline">
            Open the full checker
          </Link>
        </div>
      )}
    </div>
  );
}
