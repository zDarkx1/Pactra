"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "react-aria-components";
import { ArrowRight, Pause, Play } from "@phosphor-icons/react";
import GhostFibers from "./ghost-fibers";
export function ProductBanner() {
  const [paused, setPaused] = useState(false);
  return (
    <section
      aria-labelledby="product-title"
      data-testid="product-banner"
      className="relative isolate flex min-h-[493px] flex-col items-center justify-center overflow-hidden rounded-3xl bg-[#120f17] px-5 py-16 text-center text-canvas lg:min-h-[634px] lg:py-36"
    >
      <div className="absolute inset-0 -z-20">
        <GhostFibers
          lineColor="#70649e"
          glowColor="#3437a0"
          dpr={1}
          fps={30}
          paused={paused}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-black/25" />
      <p className="mb-6 text-xs tracking-[.16em] uppercase text-white/75">
        Clear terms. Shared evidence.
      </p>
      <h2
        id="product-title"
        className="mb-0 font-serif text-[clamp(3.5rem,7vw,6.5rem)] leading-[1.05] font-normal tracking-[-.035em] text-canvas"
      >
        Pactra <span className="block sm:inline">Workspace</span>
      </h2>
      <p className="my-8 max-w-[640px] font-serif text-xl leading-[1.4] lg:text-2xl">
        Agree on the work. Review what matters.
        <br />
        Keep the final decision human.
      </p>
      <Link
        href="/tasks"
        className="group inline-flex min-h-11 items-center gap-3 rounded-lg bg-canvas px-5 text-sm text-ink no-underline transition-colors hover:bg-[#e6dfd8]"
      >
        Explore Pactra
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-1 motion-reduce:transform-none"
        />
      </Link>
      <Button
        aria-label={
          paused ? "Play background animation" : "Pause background animation"
        }
        onPress={() => setPaused(!paused)}
        className="absolute right-4 bottom-4 flex size-11 items-center justify-center rounded-full border border-white/30 bg-black/20 p-0 text-white hover:bg-black/50"
      >
        {paused ? <Play size={16} /> : <Pause size={16} />}
      </Button>
    </section>
  );
}
