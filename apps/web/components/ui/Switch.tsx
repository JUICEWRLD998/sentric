"use client";

import { motion } from "framer-motion";
import styles from "./Switch.module.css";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (c: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? undefined : "Toggle"}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`${styles.switch}${checked ? ` ${styles.on}` : ""}${disabled ? ` ${styles.disabled}` : ""}`}
    >
      <span className={styles.track} aria-hidden>
        <motion.span
          className={styles.knob}
          animate={{ x: checked ? 18 : 2 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </button>
  );
}
