"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { durationsSec, easings, fadeUp, staggerParent } from "@/lib/motion";
import type { Address } from "viem";
import { Badge, Card, PageHeader, CodeBlock, Skeleton, Field, Input } from "@/components/ui";
import patterns from "@/app/patterns.module.css";
import { useAuditHistory } from "@/hooks";
import { ADDRESSES } from "@/lib/config";
import { shortHash } from "@/lib/format";
import styles from "./reason.module.css";

const DECISION_CARD_TONE: Record<string, "danger" | "success" | "default"> = {
  HEDGE: "danger",
  STAND_DOWN: "success",
  HOLD: "default",
};

const DECISION_BADGE_TONE: Record<string, "danger" | "success" | "neutral"> = {
  HEDGE: "danger",
  STAND_DOWN: "success",
  HOLD: "neutral",
};

const RAIL_TONE: Record<string, string> = {
  danger: styles.railDanger,
  success: styles.railSuccess,
  default: styles.railHold,
};

const CONFIDENCE_FILL_TONE: Record<string, string> = {
  danger: styles.confDanger,
  success: styles.confSuccess,
  default: styles.confHold,
};

export default function ReasonExplorerPage() {
  const [brain, setBrain] = useState<string>(ADDRESSES.brain);
  const receipts = useAuditHistory(brain as Address, 20);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Summary tally is derived from the loaded receipts — never hardcoded.
  const tally = useMemo(() => {
    const list = receipts ?? [];
    const counts = { HEDGE: 0, STAND_DOWN: 0, HOLD: 0 };
    for (const r of list) {
      const key = (r.decision ?? "").toUpperCase();
      if (key === "HEDGE") counts.HEDGE += 1;
      else if (key === "STAND_DOWN") counts.STAND_DOWN += 1;
      else if (key === "HOLD") counts.HOLD += 1;
    }
    return { ...counts, total: list.length };
  }, [receipts]);

  return (
    <motion.main
      variants={staggerParent(0.05)}
      initial="hidden"
      animate="show"
      className={styles.main}
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          eyebrow="Reason Explorer"
          title="Audit receipts"
          description="Every decision the agent made, with the inputs it saw — the on-chain reasoning trail."
        />
        <div className={styles.controls}>
          <Field label="Brain address" hint="switch to the phase-2 brain for historical receipts">
            <Input
              mono
              value={brain}
              onChange={(e) => setBrain(e.target.value.trim() as typeof ADDRESSES.brain)}
              spellCheck={false}
            />
          </Field>
          <div className={styles.segmented} role="group" aria-label="Brain version">
            <button
              type="button"
              className={brain === ADDRESSES.brain ? styles.segActive : styles.seg}
              aria-pressed={brain === ADDRESSES.brain}
              onClick={() => setBrain(ADDRESSES.brain)}
            >
              v4 (live)
            </button>
            <button
              type="button"
              className={brain === ADDRESSES.brainV2 ? styles.segActive : styles.seg}
              aria-pressed={brain === ADDRESSES.brainV2}
              onClick={() => setBrain(ADDRESSES.brainV2)}
            >
              v2 (historical)
            </button>
          </div>
        </div>
      </motion.div>

      {receipts === undefined ? (
        <Card>
          <Skeleton lines={6} />
        </Card>
      ) : receipts.length === 0 ? (
        <Card>
          <div className={styles.empty}>
            <span className={styles.emptySignal} aria-hidden />
            <p className={styles.emptyKicker}>{"// audit stream · signal null"}</p>
            <p className={styles.emptyTitle}>No receipts on record</p>
            <p className={styles.emptyHint}>
              Arm the guardian — each epoch it will post an AuditEvent here.
            </p>
          </div>
        </Card>
      ) : (
        <div className={styles.ledger}>
          <motion.div variants={fadeUp}>
            <Card className={`${styles.summaryCard} ${patterns.gridLines}`}>
              <div className={styles.summaryInner}>
                <div className={styles.summaryHead}>
                  <span className={styles.summaryKicker}>Decision tally</span>
                  <span className={styles.summaryLive}>
                    <span className={styles.liveDot} aria-hidden />
                    live · {tally.total} {tally.total === 1 ? "receipt" : "receipts"}
                  </span>
                </div>
                <dl className={styles.tally}>
                  <div className={styles.tallyItem}>
                    <dt className={styles.tallyLabel}>HEDGE</dt>
                    <dd className={`${styles.tallyValue} ${styles.tallyDanger}`}>{tally.HEDGE}</dd>
                  </div>
                  <div className={styles.tallyItem}>
                    <dt className={styles.tallyLabel}>STAND_DOWN</dt>
                    <dd className={`${styles.tallyValue} ${styles.tallySuccess}`}>{tally.STAND_DOWN}</dd>
                  </div>
                  <div className={styles.tallyItem}>
                    <dt className={styles.tallyLabel}>HOLD</dt>
                    <dd className={`${styles.tallyValue} ${styles.tallyNeutral}`}>{tally.HOLD}</dd>
                  </div>
                  <div className={`${styles.tallyItem} ${styles.tallyTotalItem}`}>
                    <dt className={styles.tallyLabel}>TOTAL</dt>
                    <dd className={`${styles.tallyValue} ${styles.tallyTotal}`}>{tally.total}</dd>
                  </div>
                </dl>
              </div>
            </Card>
          </motion.div>

          {receipts.map((r) => {
            const key = `${r.transactionHash}-${r.logIndex}`;
            const cardTone = DECISION_CARD_TONE[r.decision] ?? "default";
            const badgeTone = DECISION_BADGE_TONE[r.decision] ?? "neutral";
            const railClass = RAIL_TONE[cardTone];
            const fillClass = CONFIDENCE_FILL_TONE[cardTone];
            const pct = Math.max(0, Math.min(100, r.confidence ?? 0));
            const isOpen = expanded === key;
            return (
              <motion.article key={key} variants={fadeUp}>
                <div
                  className={`${styles.entrySurface} ${patterns.glassCard} ${patterns.edgeLight} ${patterns.gridLines}`}
                >
                  <span className={`${styles.rail} ${railClass}`} aria-hidden />
                  <div className={styles.entryTop}>
                    <div className={styles.entryMain}>
                      <Badge tone={badgeTone} dot>{r.decision}</Badge>
                      <div className={styles.confidence}>
                        <div className={styles.confidenceHead}>
                          <span className={styles.confidenceValue}>{r.confidence}</span>
                          <span className={styles.confidenceUnit}>/100</span>
                        </div>
                        <span
                          className={styles.confidenceTrack}
                          role="progressbar"
                          aria-label="Confidence score"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={pct}
                        >
                          <motion.span
                            className={`${styles.confidenceFill} ${fillClass}`}
                            initial={{ width: "0%" }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: durationsSec[3], ease: easings.outExpo }}
                          />
                        </span>
                      </div>
                    </div>
                    <dl className={styles.meta}>
                      <div className={styles.metaItem}>
                        <dt className={styles.metaLabel}>block</dt>
                        <dd className={styles.metaValue}>{r.blockNumber?.toString() ?? "–"}</dd>
                      </div>
                      <div className={styles.metaItem}>
                        <dt className={styles.metaLabel}>tx</dt>
                        <dd className={styles.metaValue}>{r.transactionHash ? shortHash(r.transactionHash) : "–"}</dd>
                      </div>
                      <div className={styles.metaItem}>
                        <dt className={styles.metaLabel}>inputs</dt>
                        <dd className={styles.metaValue}>{shortHash(r.inputsHash)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className={styles.entryBottom}>
                    <button
                      type="button"
                      className={styles.expand}
                      onClick={() => setExpanded(isOpen ? null : key)}
                      aria-expanded={isOpen}
                    >
                      <span className={styles.expandGlyph} aria-hidden>{isOpen ? "▴" : "▾"}</span>
                      {isOpen ? "Hide raw receipt" : "Show raw receipt"}
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        key="raw"
                        className={styles.raw}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: durationsSec[2], ease: easings.inOut }}
                      >
                        <div className={styles.rawInner}>
                          <CodeBlock
                            label={`AuditEvent · ${r.transactionHash}`}
                            code={JSON.stringify(
                              {
                                inputsHash: r.inputsHash,
                                decision: r.decision,
                                confidence: r.confidence,
                                asset: r.asset,
                                blockNumber: r.blockNumber?.toString(),
                                transactionHash: r.transactionHash,
                              },
                              null,
                              2
                            )}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </motion.main>
  );
}
