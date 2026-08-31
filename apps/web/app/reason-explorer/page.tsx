"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { fadeUp, staggerParent } from "@/lib/motion";
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

export default function ReasonExplorerPage() {
  const [brain, setBrain] = useState<string>(ADDRESSES.brain);
  const receipts = useAuditHistory(brain as Address, 20);
  const [expanded, setExpanded] = useState<string | null>(null);

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
        <Skeleton lines={6} />
      ) : receipts.length === 0 ? (
        <Card>
          <p className={styles.empty}>
            No AuditEvents found for this brain yet. Arm the guardian — each epoch it will post a receipt here.
          </p>
        </Card>
      ) : (
        <div className={styles.ledger}>
          {receipts.map((r) => {
            const key = `${r.transactionHash}-${r.logIndex}`;
            const cardTone = DECISION_CARD_TONE[r.decision] ?? "default";
            const badgeTone = DECISION_BADGE_TONE[r.decision] ?? "neutral";
            const railClass = RAIL_TONE[cardTone];
            const isOpen = expanded === key;
            return (
              <motion.article key={key} variants={fadeUp} className={styles.entry}>
                <div className={`${styles.entrySurface} ${patterns.gridLines}`}>
                  <span className={`${styles.rail} ${railClass}`} aria-hidden />
                  <div className={styles.entryTop}>
                    <div className={styles.entryMain}>
                      <Badge tone={badgeTone} dot>{r.decision}</Badge>
                      <div className={styles.confidence}>
                        <span className={styles.confidenceValue}>{r.confidence}</span>
                        <span className={styles.confidenceUnit}>/100</span>
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
                      {isOpen ? "Hide raw receipt" : "Show raw receipt"}
                    </button>
                  </div>
                  {isOpen && (
                    <div className={styles.raw}>
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
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </motion.main>
  );
}
