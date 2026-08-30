"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Wraps the app in Framer Motion's MotionConfig so every motion.* component
 * honors `prefers-reduced-motion` (drops transforms, keeps opacity) with
 * zero per-component code. (Noviq UI Playbook §5.4)
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
