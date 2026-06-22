"use client";

import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type LoadingTransitionPhase = "loading" | "revealing";

type LoadingTransitionProps = HTMLAttributes<HTMLDivElement> & {
  fullScreen?: boolean;
  phase?: LoadingTransitionPhase;
};

const tileCount = 72;

export function LoadingTransition({ className, fullScreen = false, phase = "loading", ...props }: LoadingTransitionProps) {
  return (
    <div
      className={cn(
        "eco-loading-transition relative isolate flex min-h-[50vh] items-center justify-center overflow-hidden",
        fullScreen && "fixed inset-0 min-h-screen",
        className
      )}
      data-phase={phase}
      role="status"
      aria-label="Chargement"
      {...props}
    >
      <div className="eco-loading-mosaic" aria-hidden="true">
        {Array.from({ length: tileCount }, (_, index) => (
          <span className="eco-loading-tile" key={index} />
        ))}
      </div>
      <div className="eco-loading-focus" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
