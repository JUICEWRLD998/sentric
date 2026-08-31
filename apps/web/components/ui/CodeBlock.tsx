"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { durationsSec, easings, fadeIn } from "@/lib/motion";
import { Button } from "./Button";
import styles from "./CodeBlock.module.css";

export interface CodeBlockProps {
  code: string;
  label?: string;
  copyable?: boolean;
}

export function CodeBlock({ code, label, copyable = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.header}>
        {label && <span className={styles.label}>{label}</span>}
        {copyable && (
          <Button variant="ghost" size="sm" onClick={handleCopy} className={styles.copyBtn}>
            <AnimatePresence mode="wait" initial={false}>
              {copied ? (
                <motion.span
                  key="copied"
                  className={styles.copyText}
                  initial={fadeIn.hidden}
                  animate={fadeIn.show}
                  exit={{ opacity: 0, transition: { duration: durationsSec[1], ease: easings.outQuart } }}
                >
                  Copied
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  className={styles.copyText}
                  initial={fadeIn.hidden}
                  animate={fadeIn.show}
                  exit={{ opacity: 0, transition: { duration: durationsSec[1], ease: easings.outQuart } }}
                >
                  Copy
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        )}
      </div>
      <pre className={styles.pre}>
        <code className={styles.code}>{code}</code>
      </pre>
    </div>
  );
}
