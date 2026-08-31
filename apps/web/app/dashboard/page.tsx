"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeUp, staggerParent } from "@/lib/motion";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import {
  Card,
  Badge,
  Stat,
  Grid,
  Stack,
  PageHeader,
  Slider,
  Switch,
  Skeleton,
  Button,
} from "@/components/ui";
import { useBrainState, useBrainActions, useVaultState, useLiveBook, useHedgeTimeline } from "@/hooks";
import { ADDRESSES } from "@/lib/config";
import { formatUsdc, shortHash, formatPctRaw } from "@/lib/format";
import brainAbi from "@/lib/abi/brain.json";
import patterns from "../patterns.module.css";
import styles from "./dashboard.module.css";

const STATE_TONE: Record<string, "neutral" | "accent" | "warning" | "success" | "danger"> = {
  Idle: "neutral",
  Fetching: "accent",
  Deciding: "warning",
  Scoring: "accent",
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const brain = useBrainState(ADDRESSES.brain);
  const vault = useVaultState();
  const book = useLiveBook(vault?.poolAddress);
  const timeline = useHedgeTimeline(ADDRESSES.brain);
  const actions = useBrainActions();
  const { writeContract, isPending: thresholdPending } = useWriteContract();

  // Current threshold knobs (owner-tunable via setHedgeConfig).
  const { data: moveBpsOnChain } = useReadContract({
    address: ADDRESSES.brain,
    abi: brainAbi as Abi,
    functionName: "expectedMoveBps",
  });
  const { data: downBpsOnChain } = useReadContract({
    address: ADDRESSES.brain,
    abi: brainAbi as Abi,
    functionName: "downPriceBps",
  });
  const [moveBps, setMoveBps] = useState(200);
  const [downBps, setDownBps] = useState(4500);

  const stateName = brain?.stateName ?? "Idle";
  const stateTone = STATE_TONE[stateName] ?? "neutral";

  const pUp = book?.pUpRaw ? Number(book.pUpRaw) / 1e6 : null;
  const pDown = book?.pDownRaw ? Number(book.pDownRaw) / 1e6 : null;

  const recent = useMemo(() => (timeline ? timeline.slice(0, 8) : []), [timeline]);

  const saveThresholds = () => {
    if (!address) return;
    writeContract({
      abi: brainAbi as Abi,
      address: ADDRESSES.brain,
      functionName: "setHedgeConfig",
      args: [
        ADDRESSES.vault,
        1000000000000n, // exposure 1M USDC (6-dec)
        10000000n, // max premium 10 USDC/window
        BigInt(moveBps),
        BigInt(downBps),
      ],
    });
  };

  return (
    <motion.main
      variants={staggerParent(0.06)}
      initial="hidden"
      animate="show"
      className={`${patterns.page} ${styles.main}`}
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          eyebrow="Live dashboard"
          title="Portfolio guardian"
          description="The on-chain agent in real time — status, market odds and every hedge it has placed."
        />
      </motion.div>

      <Grid cols={2} gap={4}>
        {/* Agent status */}
        <motion.div variants={fadeUp}>
          <Card title="Agent" subtitle={shortHash(ADDRESSES.brain)}>
            <Stack gap={3}>
              <div className={styles.row}>
                <Badge tone={stateTone} dot>{stateName}</Badge>
                {brain?.positionOpen && <Badge tone="accent" dot>position open</Badge>}
                {brain?.isSubscribed
                  ? <Badge tone="success" dot>subscribed</Badge>
                  : <Badge tone="neutral">not subscribed</Badge>}
              </div>
              <div className={styles.statsRow}>
                <Stat label="Loss streak" value={String(brain?.lossStreak ?? 0)} />
                <Stat label="Open nonce" value={String(brain?.lastOrderNonce ?? "–")} />
                <Stat
                  label="Open qty"
                  value={brain?.lastOrderQtyRaw ? formatUsdc(brain.lastOrderQtyRaw) : "–"}
                  sub="outcome tokens"
                />
              </div>
              <div className={styles.row}>
                <Switch
                  checked={!!brain?.isSubscribed}
                  onCheckedChange={(c) => (c ? actions.armBrain() : actions.disarmBrain())}
                  disabled={!isConnected || actions.isPending}
                  label={brain?.isSubscribed ? "Armed" : "Arm the guardian"}
                />
              </div>
            </Stack>
          </Card>
        </motion.div>

        {/* Vault */}
        <motion.div variants={fadeUp}>
          <Card title="Vault" subtitle={shortHash(ADDRESSES.vault)}>
            <Stack gap={3}>
              <div className={styles.row}>
                {vault?.paused && <Badge tone="danger" dot>paused</Badge>}
                <Badge tone="neutral">
                  premium cap {vault ? formatUsdc(vault.maxPremiumPerWindowRaw) : "–"}/window
                </Badge>
              </div>
              <div className={styles.statsRow}>
                <Stat
                  label="Collateral"
                  value={vault ? formatUsdc(vault.tusdcBalanceRaw) : "–"}
                  sub="tUSDC"
                  tone="success"
                />
                <Stat
                  label="Window premium"
                  value={vault ? formatUsdc(vault.windowPremiumSpentRaw) : "–"}
                  sub="spent this epoch"
                />
                <Stat
                  label="Daily premium"
                  value={vault ? formatUsdc(vault.dailyPremiumSpentRaw) : "–"}
                  sub="spent today"
                />
              </div>
            </Stack>
          </Card>
        </motion.div>

        {/* Live market */}
        <motion.div variants={fadeUp}>
          <Card title="Live market" subtitle={vault?.poolAddress ? shortHash(vault.poolAddress) : "no pool set"}>
            {book ? (
              <Stack gap={3}>
                <div className={styles.oddsRow}>
                  <div className={styles.oddsBar} aria-hidden="true">
                    <motion.div
                      className={styles.oddsUp}
                      animate={{ width: `${pUp ? Math.round(pUp * 100) : 50}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className={styles.oddsLabels}>
                    <span className={styles.oddsUpLabel}>
                      Up {pUp !== null ? formatPctRaw(book.pUpRaw) : "–"}
                    </span>
                    <span className={styles.oddsDownLabel}>
                      Down {pDown !== null ? formatPctRaw(book.pDownRaw) : "–"}
                    </span>
                  </div>
                </div>
                <div className={styles.statsRow}>
                  <Stat label="Best YES bid" value={formatUsdc(book.bestYesBidRaw)} />
                  <Stat label="Best YES ask" value={formatUsdc(book.bestYesAskRaw)} />
                  <Stat label="Top depth" value={formatUsdc(book.topDepthRaw)} sub="tokens" />
                </div>
              </Stack>
            ) : (
              <Skeleton lines={3} />
            )}
          </Card>
        </motion.div>

        {/* Thresholds */}
        <motion.div variants={fadeUp}>
          <Card title="Thresholds" subtitle="owner-only · setHedgeConfig">
            <Stack gap={4}>
              <Slider
                label="Insured move"
                value={moveBps}
                min={50}
                max={1000}
                step={25}
                formatValue={(v) => `${v} bps`}
                onValueChange={setMoveBps}
              />
              <Slider
                label="Down price"
                value={downBps}
                min={1000}
                max={9000}
                step={100}
                formatValue={(v) => formatPctRaw(BigInt(v * 100))}
                onValueChange={setDownBps}
              />
              <div className={styles.row}>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={thresholdPending}
                  disabled={!isConnected}
                  onClick={saveThresholds}
                >
                  Save thresholds
                </Button>
                <span className={styles.hint}>
                  on-chain: move {moveBpsOnChain?.toString() ?? "–"} bps · down{" "}
                  {downBpsOnChain?.toString() ?? "–"} bps
                </span>
              </div>
            </Stack>
          </Card>
        </motion.div>
      </Grid>

      {/* Hedge history */}
      <motion.div variants={fadeUp} className={styles.history}>
        <Card title="Hedge history" subtitle="brain events · newest first">
          {timeline === undefined ? (
            <Skeleton lines={4} />
          ) : recent.length === 0 ? (
            <p className={styles.empty}>
              No hedges yet — arm the guardian and wait for a decision cycle.
            </p>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Block</th>
                  <th>Details</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={`${e.transactionHash}-${e.logIndex}`}>
                    <td><Badge tone="accent">{e.kind}</Badge></td>
                    <td className={styles.mono}>{e.blockNumber?.toString() ?? "–"}</td>
                    <td className={styles.details}>{e.summary ?? "–"}</td>
                    <td className={styles.mono}>
                      {e.transactionHash ? shortHash(e.transactionHash) : "–"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </motion.div>
    </motion.main>
  );
}
