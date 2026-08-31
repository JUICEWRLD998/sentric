"use client";

import { motion, useReducedMotion } from "framer-motion";
import styles from "./Pulse.module.css";

export type PulseTone = "accent" | "success" | "warning" | "danger" | "neutral";

export interface PulseProps {
  tone?: PulseTone;
  /** Whether the breathing ring is active. Default true. */
  live?: boolean;
  label?: string;
}

export function Pulse({ tone = "accent", live = true, label }: PulseProps) {
  const reduce = useReducedMotion();

  return (
    <span className={`${styles.pulse} ${styles[tone]}`}>
      <span className={styles.coreWrap}>
        {live && !reduce && (
          <motion.span
            className={styles.ring}
            aria-hidden
            animate={{ scale: [1, 2.3], opacity: [0.6, 0] }}
            transition={{ duration: 1.8, ease: "easeOut", repeat: Infinity }}
          />
        )}
        <span className={styles.dot} aria-hidden />
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </span>
  );
}
