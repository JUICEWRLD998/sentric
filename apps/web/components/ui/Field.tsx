"use client";

import { createContext, forwardRef, useContext } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import styles from "./Field.module.css";

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

const FieldContext = createContext<{ hasError: boolean }>({ hasError: false });

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <FieldContext.Provider value={{ hasError: Boolean(error) }}>{children}</FieldContext.Provider>
      {hint && !error && <span className={styles.hint}>{hint}</span>}
      {error && <span className={styles.errorMsg}>{error}</span>}
    </label>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  mono?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { mono = false, className, ...props },
  ref,
) {
  const { hasError } = useContext(FieldContext);
  const classes = `${styles.input}${hasError ? ` ${styles.errorInput}` : ""}${mono ? ` ${styles.mono}` : ""}${className ? ` ${className}` : ""}`;

  return <input ref={ref} className={classes} {...props} />;
});
