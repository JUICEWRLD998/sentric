import type { ReactNode } from "react";
import styles from "./Stack.module.css";

export type StackGap = 2 | 3 | 4 | 5 | 6 | 8;
export type StackAlign = "start" | "center" | "end" | "stretch";

export interface StackProps {
  gap?: StackGap;
  align?: StackAlign;
  children: ReactNode;
}

export function Stack({ gap = 4, align = "stretch", children }: StackProps) {
  return (
    <div className={`${styles.stack} ${styles[`gap${gap}`]} ${styles[`align${align}`]}`}>
      {children}
    </div>
  );
}
