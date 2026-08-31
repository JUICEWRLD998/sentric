"use client";

import { motion, useReducedMotion } from "framer-motion";
import { durationsSec } from "@/lib/motion";
import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  radius?: string;
  lines?: number;
}

export function Skeleton({ width, height, radius, lines = 1 }: SkeletonProps) {
  const reduceMotion = useReducedMotion();
  const count = Math.max(1, Math.floor(lines));

  return (
    <div className={styles.wrap} aria-hidden>
      {Array.from({ length: count }).map((_, index) => {
        const isLast = index === count - 1;
        return (
          <motion.div
            key={index}
            className={styles.line}
            style={{
              width,
              height,
              borderRadius: radius,
              ...(count > 1 && isLast
                ? { width: typeof width === "number" ? width * 0.6 : "60%" }
                : {}),
            }}
            animate={reduceMotion ? undefined : { opacity: [0.5, 1, 0.5] }}
            transition={
              reduceMotion
                ? undefined
                : { duration: durationsSec[5], ease: "easeInOut", repeat: Infinity }
            }
          />
        );
      })}
    </div>
  );
}
