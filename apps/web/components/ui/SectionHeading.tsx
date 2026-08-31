import type { ReactNode } from "react";
import styles from "./SectionHeading.module.css";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  align?: "start" | "center";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "start",
  className,
}: SectionHeadingProps) {
  return (
    <div className={`${styles.head} ${styles[align]}${className ? ` ${className}` : ""}`}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
