"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { fadeUp, staggerParent } from "@/lib/motion";
import { Card, Badge, Stat, Stack, Skeleton } from "@/components/ui";
import { useBrainState, useVaultState, useLiveBook, useAuditHistory } from "@/hooks";
import { ADDRESSES } from "@/lib/config";
import { formatUsdc, formatPctRaw, shortHash } from "@/lib/format";
import patterns from "./patterns.module.css";
import styles from "./landing.module.css";

const STEPS = [
  {
    n: "01",
    title: "Observe",
    body: "The contract wakes itself every ~5 minutes through Somnia reactivity — no keeper, no server, no oracle middleware.",
  },
  {
    n: "02",
    title: "Decide",
    body: "It fetches the live BTC price and an on-chain LLM picks HEDGE, STAND_DOWN or HOLD — with a confidence score.",
  },
  {
    n: "03",
    title: "Hedge",
    body: "On HEDGE it buys a Down Event Contract sized to the exposure, bounded by per-window and per-day premium budgets.",
  },
  {
    n: "04",
    title: "Redeem",
    body: "Settled winnings are redeemed automatically. Every step of the loop leaves an on-chain AuditEvent receipt.",
  },
];

const RAILS = [
  ["Non-custodial vault", "Deposits are yours; the agent can only hedge, never move funds out."],
  ["Hard safety rails", "Max premium per window and per day, a pause circuit breaker, and a loss-streak stop-loss."],
  ["No keepers", "EpochTick self-wake means the guardian acts even if nobody is watching."],
  ["Every decision auditable", "The Reason Explorer renders each receipt — inputs, decision, confidence, on-chain."],
];

export default function Landing() {
  const brain = useBrainState(ADDRESSES.brain);
  const vault = useVaultState();
  const book = useLiveBook(vault?.poolAddress)?.data ?? null;
  const receipts = useAuditHistory(ADDRESSES.brainV2, 5);
  const latest = receipts && receipts.length > 0 ? receipts[0] : null;

  const pUp = book?.pUpRaw ? Number(book.pUpRaw) / 1e6 : null;
  const pDown = book?.pDownRaw ? Number(book.pDownRaw) / 1e6 : null;

  return (
    <>
      {/* Full-bleed static background: mesh gradient + film grain. */}
      <div className={`${patterns.mesh} ${patterns.filmGrain}`} aria-hidden="true" />

      <motion.main
        variants={staggerParent(0.08)}
        initial="hidden"
        animate="show"
        className={styles.main}
      >
        {/* ---------------------------------------------------------- hero */}
        <motion.section variants={fadeUp} className={styles.hero}>
          <p className={styles.eyebrow}>Self-insuring portfolio · fully on-chain</p>
          <h1 className={styles.title}>
            Your portfolio
            <br />
            guards <span className={styles.accent}>itself</span>.
          </h1>
          <p className={styles.tagline}>
            Sentric is an autonomous insurance agent living on the Somnia blockchain. It
            watches the market, decides when to hedge, buys Down Event Contracts — and
            shows you the receipt for every decision.
          </p>
          <div className={styles.actions}>
            <Link className={styles.ctaPrimary} href="/dashboard">
              Open the dashboard
            </Link>
            <Link className={styles.ctaSecondary} href="/reason-explorer">
              Read the reasoning
            </Link>
          </div>

          {/* Live status strip — real on-chain state. */}
          <div className={styles.live}>
            <Card title="Agent" subtitle={shortHash(ADDRESSES.brain)}>
              <Stack gap={3}>
                <div className={styles.row}>
                  <Badge tone={brain?.positionOpen ? "accent" : "neutral"} dot>
                    {brain?.positionOpen ? "hedging" : "standing by"}
                  </Badge>
                  {brain?.isSubscribed ? (
                    <Badge tone="success" dot>subscribed</Badge>
                  ) : (
                    <Badge tone="neutral">awaiting arm</Badge>
                  )}
                </div>
                <Stat
                  label="State"
                  value={brain?.stateName ?? "–"}
                  sub="decision cycle"
                />
              </Stack>
            </Card>

            <Card title="Market" subtitle="live order book">
              {book ? (
                <Stack gap={3}>
                  <div className={styles.oddsBar} aria-hidden="true">
                    <motion.div
                      className={styles.oddsUp}
                      animate={{ width: `${pUp ? Math.round(pUp * 100) : 50}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className={styles.oddsLabels}>
                    <span className={styles.oddsUpLabel}>Up {pUp !== null ? formatPctRaw(book.pUpRaw) : "–"}</span>
                    <span className={styles.oddsDownLabel}>Down {pDown !== null ? formatPctRaw(book.pDownRaw) : "–"}</span>
                  </div>
                </Stack>
              ) : (
                <Skeleton lines={2} />
              )}
            </Card>

            <Card title="Vault" tone="success">
              <Stack gap={3}>
                <Stat
                  label="Collateral"
                  value={vault ? formatUsdc(vault.tusdcBalanceRaw) : "–"}
                  sub="tUSDC"
                  tone="success"
                />
                <Stat
                  label="Premium today"
                  value={vault ? formatUsdc(vault.dailyPremiumSpentRaw) : "–"}
                  sub="budgeted daily"
                />
              </Stack>
            </Card>

            <Card title="Last decision" subtitle="from the on-chain audit trail">
              {latest ? (
                <Stack gap={3}>
                  <div className={styles.row}>
                    <Badge tone={latest.decision === "HEDGE" ? "danger" : "success"} dot>
                      {latest.decision}
                    </Badge>
                    <Stat label="Confidence" value={`${latest.confidence}/100`} />
                  </div>
                  <p className={styles.receiptMeta}>
                    {shortHash(latest.inputsHash)} · block {latest.blockNumber?.toString()}
                  </p>
                </Stack>
              ) : (
                <Skeleton lines={2} />
              )}
            </Card>
          </div>
        </motion.section>

        {/* ---------------------------------------------------- the loop */}
        <motion.section variants={fadeUp} className={styles.section}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 className={styles.h2}>A guardian that never sleeps</h2>
            <p className={styles.sectionBody}>
              Four steps, every ~5 minutes, entirely on-chain.
            </p>
          </div>
          <div className={styles.steps}>
            {STEPS.map((s) => (
              <div key={s.n} className={styles.step}>
                <span className={styles.stepNum}>{s.n}</span>
                <h3 className={styles.stepTitle}>{s.title}</h3>
                <p className={styles.stepBody}>{s.body}</p>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ---------------------------------------------- live proof */}
        <motion.section variants={fadeUp} className={styles.section}>
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Proven on testnet</p>
            <h2 className={styles.h2}>Real receipts, real payouts</h2>
            <p className={styles.sectionBody}>
              Sentric already placed live hedges on the Somnia testnet and redeemed
              winning positions — every one of them verifiable in the Reason Explorer.
            </p>
          </div>
          <div className={styles.proof}>
            <Card tone="default" title="A real settlement">
              {latest ? (
                <Stack gap={3}>
                  <div className={styles.statsRow}>
                    <Stat label="Decision" value={latest.decision} />
                    <Stat label="Confidence" value={`${latest.confidence}/100`} />
                    <Stat label="Block" value={latest.blockNumber?.toString() ?? "–"} />
                  </div>
                  <p className={styles.receiptMeta}>
                    inputsHash <span className={styles.mono}>{latest.inputsHash}</span>
                  </p>
                  <Link className={styles.textLink} href="/reason-explorer">
                    Open the full audit trail →
                  </Link>
                </Stack>
              ) : (
                <Skeleton lines={3} />
              )}
            </Card>
            <Card tone="default" title="Safety by design">
              <Stack gap={3}>
                {RAILS.map(([t, b]) => (
                  <div key={t} className={styles.rail}>
                    <span className={styles.railTitle}>{t}</span>
                    <span className={styles.railBody}>{b}</span>
                  </div>
                ))}
              </Stack>
            </Card>
          </div>
        </motion.section>

        {/* --------------------------------------------------- closing */}
        <motion.section variants={fadeUp} className={styles.cta}>
          <h2 className={styles.h2}>Stop watching the charts. Sentric does.</h2>
          <div className={styles.actions}>
            <Link className={styles.ctaPrimary} href="/dashboard">
              Go to the dashboard
            </Link>
            <Link className={styles.ctaSecondary} href="/reason-explorer">
              Explore the receipts
            </Link>
          </div>
        </motion.section>

        <footer className={styles.footer}>
          <span>Built on Somnia · DreamDEX Event Contracts · Somnia Agents</span>
        </footer>
      </motion.main>
    </>
  );
}
