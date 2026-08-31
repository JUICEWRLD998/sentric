"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { durationsSec, springTap } from "@/lib/motion";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: "button" | "submit";
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  children,
  onClick,
  className,
  type = "button",
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      onClick={onClick}
      aria-busy={loading || undefined}
      className={`${styles.btn} ${styles[variant]} ${styles[size]}${className ? ` ${className}` : ""}`}
      whileTap={springTap.whileTap}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
    >
      {loading && (
        <motion.span
          className={styles.spinner}
          aria-hidden
          animate={{ rotate: 360 }}
          transition={{ duration: durationsSec[4], ease: "linear", repeat: Infinity }}
        />
      )}
      <span className={styles.label}>{children}</span>
    </motion.button>
  );
}
