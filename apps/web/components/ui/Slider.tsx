"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import styles from "./Slider.module.css";

export interface SliderProps {
  label?: string;
  value: number;
  onValueChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (v: number) => string;
}

export function Slider({
  label,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  formatValue,
}: SliderProps) {
  const format = formatValue ?? ((v: number) => String(v));

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        {label && <span className={styles.label}>{label}</span>}
        <span className={styles.value}>{format(value)}</span>
      </div>
      <SliderPrimitive.Root
        className={styles.root}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(values) => onValueChange(values[0])}
        aria-label={label}
      >
        <SliderPrimitive.Track className={styles.track}>
          <SliderPrimitive.Range className={styles.range} />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className={styles.thumb} />
      </SliderPrimitive.Root>
    </div>
  );
}
