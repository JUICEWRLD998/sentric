import type { ReactNode } from "react";
import patterns from "@/app/patterns.module.css";
import styles from "./Card.module.css";

export type CardTone = "default" | "success" | "warning" | "danger";

export interface CardProps {
  title?: string;
  subtitle?: string;
  tone?: CardTone;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, tone = "default", children, className }: CardProps) {
  const toneClass = tone === "default" ? "" : styles[tone];

  return (
    <section
      className={`${patterns.glassCard} ${patterns.edgeLight} ${styles.card} ${toneClass}${className ? ` ${className}` : ""}`}
    >
      {(title || subtitle) && (
        <header className={styles.header}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </header>
      )}
      <div className={styles.body}>{children}</div>
    </section>
  );
}
