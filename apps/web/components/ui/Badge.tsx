import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface BadgeProps {
  tone: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ tone, dot = false, children }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {dot && <span className={styles.dot} aria-hidden />}
      <span className={styles.text}>{children}</span>
    </span>
  );
}
