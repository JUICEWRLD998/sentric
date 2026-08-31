import styles from "./Stat.module.css";

export type StatTone = "default" | "success" | "danger";

export interface StatProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: StatTone;
  /** Defaults to true for numbers and hash-like strings. */
  mono?: boolean;
}

const HASH_RE = /^0x[0-9a-f]+$/i;
const NUMERIC_RE = /^[\d.,\s%-]+$/;

function isDataLike(value: string | number): boolean {
  if (typeof value === "number") return true;
  const text = value.trim();
  return HASH_RE.test(text) || NUMERIC_RE.test(text);
}

export function Stat({ label, value, sub, tone = "default", mono }: StatProps) {
  const useMono = mono ?? isDataLike(value);

  return (
    <div className={styles.stat}>
      <span className={styles.label}>{label}</span>
      <span className={`${styles.value} ${styles[tone]}${useMono ? ` ${styles.mono}` : ""}`}>
        {value}
      </span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  );
}
