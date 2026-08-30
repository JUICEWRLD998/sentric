"use client";

import { motion } from "framer-motion";
import { fadeUp } from "@/lib/motion";
import patterns from "./patterns.module.css";
import styles from "./page.module.css";

export default function Home() {
  return (
    <>
      {/* Full-bleed static background: mesh gradient + film grain. */}
      <div
        className={`${patterns.mesh} ${patterns.filmGrain}`}
        aria-hidden="true"
      />
      <main className={styles.main}>
        <motion.section
          className={`${patterns.glassCard} ${patterns.edgeLight} ${styles.hero}`}
          variants={fadeUp}
          initial="hidden"
          animate="show"
        >
          <p className={styles.eyebrow}>Self-insuring portfolio</p>
          <h1 className={styles.title}>Sentric</h1>
          <p className={styles.tagline}>
            A portfolio that protects itself — an autonomous guardian living
            entirely on the Somnia blockchain.
          </p>
        </motion.section>
      </main>
    </>
  );
}
