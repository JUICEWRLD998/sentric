import type { ReactNode } from "react";
import styles from "./Grid.module.css";

export type GridCols = 2 | 3 | 4 | 12;
export type GridGap = 3 | 4 | 5 | 6;

export interface GridProps {
  cols?: GridCols;
  gap?: GridGap;
  children: ReactNode;
}

export function Grid({ cols = 2, gap = 4, children }: GridProps) {
  return (
    <div className={`${styles.grid} ${styles[`cols${cols}`]} ${styles[`gap${gap}`]}`}>
      {children}
    </div>
  );
}
