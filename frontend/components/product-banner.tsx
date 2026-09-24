"use client";
import { useState } from "react";
import Link from "next/link";
import { Button } from "react-aria-components";
import { ArrowUpRight, Pause, Play } from "@phosphor-icons/react";
import GhostFibers from "./ghost-fibers";
export function ProductBanner() {
  const [paused, setPaused] = useState(false);
  return (
    <section
      aria-labelledby="product-title"
      data-testid="product-banner"
      className="relative isolate flex min-h-[450px] flex-col justify-between overflow-hidden rounded-[100px_16px_16px_16px] bg-[#120f17] p-7 text-canvas sm:p-10 lg:min-h-[560px]"
    >
      <div className="absolute inset-0 -z-20">
        <GhostFibers
          lineColor="#a899bd"
          glowColor="#70649e"
          dpr={1}
          fps={30}
          paused={paused}
        />
      </div>
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-t from-[#120f17]/95 via-[#120f17]/10 to-[#120f17]/20" />
      <p className="m-0 self-end font-mono text-[10px] tracking-[.15em] uppercase text-white/75">
        Scope / evidence / people
      </p>
      <div className="mt-28">
        <p className="mb-4 font-mono text-[10px] tracking-[.12em] uppercase text-white/65">
          Different perspectives. Shared terms.
        </p>
        <h2
          id="product-title"
          className="mb-6 max-w-sm font-serif text-[clamp(2.5rem,4vw,3.75rem)] leading-[1.04] font-normal tracking-tight text-canvas"
        >
          Find the
          <br />
          <span className="italic">common thread.</span>
        </h2>
        <div className="flex items-center justify-between gap-5 border-t border-white/30 pt-5">
          <Link
            href="/tasks"
            className="group inline-flex min-h-11 items-center gap-4 text-sm text-canvas no-underline hover:underline"
          >
            Explore Pactra
            <ArrowUpRight
              size={18}
              className="transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none"
            />
          </Link>
          <Button
            aria-label={
              paused
                ? "Play background animation"
                : "Pause background animation"
            }
            onPress={() => setPaused(!paused)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/20 p-0 text-white hover:bg-black/50"
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </Button>
        </div>
      </div>
    </section>
  );
}
