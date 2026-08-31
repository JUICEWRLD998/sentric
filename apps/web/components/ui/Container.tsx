import type { ReactNode } from "react";
import styles from "./Container.module.css";

export type ContainerSize = "sm" | "md" | "lg" | "xl";

export interface ContainerProps {
  size?: ContainerSize;
  children: ReactNode;
  className?: string;
}

export function Container({ size = "lg", children, className }: ContainerProps) {
  return (
    <div className={`${styles.container} ${styles[size]}${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}
