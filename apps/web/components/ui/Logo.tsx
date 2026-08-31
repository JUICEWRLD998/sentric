import Link from "next/link";
import styles from "./Logo.module.css";

export interface LogoProps {
  href?: string;
  className?: string;
}

export function Logo({ href = "/", className }: LogoProps) {
  return (
    <Link
      href={href}
      className={`${styles.logo}${className ? ` ${className}` : ""}`}
      aria-label="Sentric home"
    >
      <span className={styles.mark} aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" className={styles.svg}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
          <circle cx="12" cy="12" r="3.25" fill="currentColor" />
          <path d="M12 2.5v2.5M12 19v2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </svg>
      </span>
      <span className={styles.wordmark}>Sentric</span>
    </Link>
  );
}
