"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { fadeUp, staggerParent } from "@/lib/motion";
import { Card, Badge, Stat, Stack, PageHeader, CodeBlock, Skeleton, Grid, Field, Input } from "@/components/ui";
import { useAuditHistory } from "@/hooks";
import { ADDRESSES } from "@/lib/config";
import { shortHash } from "@/lib/format";
import patterns from "../patterns.module.css";
import styles from "./reason.module.css";

const DECISION_TONE: Record<string, "accent" | "success" | "neutral" | "danger"> = {
  HEDGE: "danger",
  STAND_DOWN: "success",
  HOLD: "neutral",
};

export default function ReasonExplorerPage() {
  const [brain, setBrain] = useState(ADDRESSES.brain);
  const { data: receipts, isLoading } = useAuditHistory(brain, 20);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <motion.main
      variants={staggerParent(0.05)}
      initial="hidden"
      animate="show"
      className={`${patterns.page} ${styles.main}`}
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
              onChange={(e) => setBrain(e.target.value.trim())}
              spellCheck={false}
            />
          </Field>
          <div className={styles.chips}>
            <button className={brain === ADDRESSES.brain ? styles.chipActive : styles.chip} onClick={() => setBrain(ADDRESSES.brain)}>
              v4 (live)
            </button>
            <button className={brain === ADDRESSES.brainV2 ? styles.chipActive : styles.chip} onClick={() => setBrain(ADDRESSES.brainV2)}>
              v2 (historical)
            </button>
          </div>
        </div>
      </motion.div>

      {isLoading && receipts === undefined ? (
        <Skeleton lines={6} />
      ) : !receipts || receipts.length === 0 ? (
        <Card>
          <p className={styles.empty}>
            No AuditEvents found for this brain yet. Arm the guardian — each epoch it will post a receipt here.
          </p>
        </Card>
      ) : (
        <Stack gap={4}>
          {receipts.map((r) => {
            const key = `${r.transactionHash}-${r.logIndex}`;
            const tone = DECISION_TONE[r.decision] ?? "neutral";
            const isOpen = expanded === key;
            return (
              <motion.div key={key} variants={fadeUp}>
                <Card
                  tone={tone}
                  title={`Decision: ${r.decision}`}
                  subtitle={`block ${r.blockNumber?.toString() ?? "–"} · ${r.transactionHash ? shortHash(r.transactionHash) : "–"}`}
                >
                  <Stack gap={3}>
                    <div className={styles.statsRow}>
                      <Stat label="Decision" value={r.decision} sub="constrained set" />
                      <Stat label="Confidence" value={`${r.confidence}/100`} tone={r.confidence >= 70 ? "success" : "warning"} />
                      <Stat label="Asset" value={shortHash(r.asset ?? "")} sub="BTC · address(1)" />
                      <Stat label="Block" value={r.blockNumber?.toString() ?? "–"} sub="on-chain receipt" />
                    </div>
                    <div className={styles.decisionRow}>
                      <Badge tone={tone} dot>{r.decision}</Badge>
                      <span className={styles.inputsHash}>
                        inputsHash <span className={styles.mono}>{r.inputsHash}</span>
                      </span>
                    </div>
                    <button className={styles.expand} onClick={() => setExpanded(isOpen ? null : key)}>
                      {isOpen ? "Hide raw receipt" : "Show raw receipt"}
                    </button>
                    {isOpen && (
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
                    )}
                  </Stack>
                </Card>
              </motion.div>
            );
          })}
        </Stack>
      )}
    </motion.main>
  );
}
