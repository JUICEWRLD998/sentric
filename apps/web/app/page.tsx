"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { fadeUp, staggerParent } from "@/lib/motion";
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
      <motion.main
        variants={staggerParent(0.1)}
        initial="hidden"
        animate="show"
        className={styles.main}
      >
        <motion.section
          className={`${patterns.glassCard} ${patterns.edgeLight} ${styles.hero}`}
          variants={fadeUp}
        >
          <p className={styles.eyebrow}>Self-insuring portfolio</p>
          <h1 className={styles.title}>Sentric</h1>
          <p className={styles.tagline}>
            A portfolio that protects itself — an autonomous guardian living
            entirely on the Somnia blockchain.
          </p>
          <div className={styles.actions}>
            <Link className={styles.ctaPrimary} href="/dashboard">
              Open dashboard
            </Link>
            <Link className={styles.ctaSecondary} href="/reason-explorer">
              See the reasoning
            </Link>
          </div>
        </motion.section>
      </motion.main>
    </>
  );
}
