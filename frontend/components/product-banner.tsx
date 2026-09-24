"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Pause, Play, ArrowDown } from "@phosphor-icons/react";
import GhostFibers from "./ghost-fibers";
export function ProductBanner() {
  const [paused, setPaused] = useState(false);
  return (
    <section
      data-expand-scene
      className="relative bg-canvas motion-safe:h-[200svh]"
      aria-label="Find common ground"
    >
      <div
        data-expand-stage
        className="relative top-0 h-svh min-h-[480px] overflow-hidden motion-safe:sticky"
      >
        <div
          data-expand-intro
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-[7vw] hidden max-w-[34vw] -translate-y-1/2 lg:block"
        >
          <p className="mb-6 font-mono text-xs uppercase tracking-widest text-muted">
            From your side. From their side.
          </p>
          <p className="font-serif text-[clamp(3rem,5vw,5.5rem)] leading-[1.02] tracking-tight">
            Meet on
            <br />
            <em className="text-[#a9583e]">common ground.</em>
          </p>
          <p className="mt-9 flex items-center gap-3 text-sm text-muted">
            <ArrowDown />
            Scroll to bring it together
          </p>
        </div>
        <section
          aria-labelledby="product-title"
          data-testid="product-banner"
          className="absolute inset-0 isolate flex items-center justify-center overflow-hidden bg-[#120f17] text-canvas"
        >
          <div className="absolute inset-0 -z-20">
            <GhostFibers
              lineColor="#a899bd"
              glowColor="#70649e"
              dpr={0.8}
              fps={24}
              paused={paused}
            />
          </div>
          <div className="pointer-events-none absolute inset-0 -z-10 bg-black/35" />
          <div
            data-expand-copy
            className="relative w-full max-w-[960px] px-8 text-center"
          >
            <h2
              id="product-title"
              className="mb-7 font-serif text-[clamp(3.2rem,7.6vw,7.4rem)] leading-[.98] font-normal tracking-[-.045em] text-canvas"
            >
              Find the
              <br />
              <span className="italic">common thread.</span>
            </h2>
            <p
              data-expand-detail
              className="mx-auto mb-7 max-w-sm font-serif text-xl text-white/85"
            >
              Different perspectives.
              <br />
              One shared definition of done.
            </p>
            <Link
              href="/tasks"
              className="inline-flex min-h-[64px] items-center gap-4 rounded-full border border-white/50 px-6 text-sm text-canvas no-underline transition-colors hover:bg-white hover:text-ink"
            >
              Explore Pactra
              <ArrowUpRight size={18} />
            </Link>
          </div>
        </section>
        <button type="button"
          aria-label={
            paused ? "Play background animation" : "Pause background animation"
          }
          onClick={() => setPaused(!paused)}
          className="absolute right-[8vw] bottom-[16%] z-10 flex size-11 items-center justify-center rounded-full border border-white/40 bg-[#120f17] p-0 text-white hover:bg-[#343044]"
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}
        </button>
        <div
          aria-hidden="true"
          data-expand-progress
          className="pointer-events-none absolute right-0 bottom-0 left-0 h-[3px] origin-left scale-x-0 bg-[#cc785c]"
        />
      </div>
    </section>
  );
}
