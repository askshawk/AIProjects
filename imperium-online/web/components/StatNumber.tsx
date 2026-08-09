"use client";

// A number that eases toward its value instead of snapping (Phase 8B).
// Thin wrapper over useCountUp so it can be used inside a .map without
// tripping the rules-of-hooks (each instance is its own component).

import { useCountUp } from "@/lib/useCountUp";

export default function StatNumber({ value, className }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return <span className={className}>{shown.toLocaleString()}</span>;
}
