"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { durationsSec, easings, scaleIn } from "@/lib/motion";
import patterns from "@/app/patterns.module.css";
import styles from "./Toast.module.css";

export type ToastTone = "default" | "success" | "danger";

export interface ToastInput {
  title?: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastItem {
  id: number;
  title?: string;
  description?: string;
  tone: ToastTone;
}

const TOAST_DURATION_MS = 5000;

const ToastContext = createContext<(input: ToastInput) => void>(() => {});

export function useToast() {
  return { toast: useContext(ToastContext) };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = ++idRef.current;
    setItems((prev) => [
      ...prev,
      { id, title: input.title, description: input.description, tone: input.tone ?? "default" },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <ToastPrimitive.Provider duration={TOAST_DURATION_MS} swipeDirection="right">
        {children}
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={scaleIn.hidden}
              animate={scaleIn.show}
              exit={{ opacity: 0, y: 8, transition: { duration: durationsSec[2], ease: easings.outQuart } }}
            >
              <ToastPrimitive.Root
                className={`${patterns.glassCard} ${styles.toast}${item.tone !== "default" ? ` ${styles[item.tone]}` : ""}`}
                onOpenChange={(open) => {
                  if (!open) remove(item.id);
                }}
              >
                {item.title && (
                  <ToastPrimitive.Title className={styles.title}>{item.title}</ToastPrimitive.Title>
                )}
                {item.description && (
                  <ToastPrimitive.Description className={styles.description}>
                    {item.description}
                  </ToastPrimitive.Description>
                )}
              </ToastPrimitive.Root>
            </motion.div>
          ))}
        </AnimatePresence>
        <ToastViewport />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function ToastViewport() {
  return <ToastPrimitive.Viewport className={styles.viewport} />;
}
