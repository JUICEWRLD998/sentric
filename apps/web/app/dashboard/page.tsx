"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { fadeUp, staggerParent } from "@/lib/motion";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import type { Abi } from "viem";
import {
  Badge,
  Button,
  Card,
  Grid,
  PageHeader,
  Pulse,
  Skeleton,
  Slider,
  Stack,
  Stat,
  Switch,
  type BadgeTone,
} from "@/components/ui";
import patterns from "@/app/patterns.module.css";
import { useBrainActions, useBrainState, useHedgeTimeline, useLiveBook, useVaultState } from "@/hooks";
import { ADDRESSES } from "@/lib/config";
import { formatPctRaw, formatUsdc, shortHash } from "@/lib/format";
import brainAbi from "@/lib/abi/brain.json";
import styles from "./dashboard.module.css";

/** SentricBrain.arm() is payable and requires this much native STT as msg.value. */
const ARM_RESERVE_STT = 33;

const STATE_TONE: Record<string, "neutral" | "accent" | "warning" | "success" | "danger"> = {
  Idle: "neutral",
  Fetching: "accent",
  Deciding: "warning",
  Scoring: "accent",
};

const EVENT_TONE: Record<string, BadgeTone> = {
  Audit: "neutral",
  PositionOpened: "accent",
  HedgeExecuted: "accent",
  HedgeRedeemed: "success",
  HedgeExpired: "warning",
  StopLossEngaged: "danger",
};

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const brain = useBrainState(ADDRESSES.brain);
  const vault = useVaultState();
  const book = useLiveBook(vault?.poolAddress)?.data ?? null;
  const timeline = useHedgeTimeline(ADDRESSES.brain);
  const actions = useBrainActions();
  const { writeContract, isPending: thresholdPending } = useWriteContract();

  // Arm preflight — arming requires the owner wallet AND ≥ 33 STT (reactivity reserve).
  const { data: owner } = useReadContract({
    address: ADDRESSES.brain,
    abi: brainAbi as Abi,
    functionName: "owner",
  });
  const { data: sttBalance } = useBalance({ address });

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
  const upPct = pUp !== null ? Math.round(pUp * 100) : 50;
  const downPct = pDown !== null ? Math.round(pDown * 100) : 50;

  const recent = useMemo(() => (timeline ? timeline.slice(0, 8) : []), [timeline]);

  // Premium budget consumption — guarded against a zero/missing window cap.
  const budgetPct = useMemo(() => {
    if (!vault || !vault.maxPremiumPerWindowRaw) return 0;
    const cap = Number(vault.maxPremiumPerWindowRaw);
    if (cap <= 0) return 0;
    return Math.min(100, Math.max(0, (Number(vault.windowPremiumSpentRaw) / cap) * 100));
  }, [vault]);

  // ---- Arm preflight logic ----
  const ownerAddr = owner ? String(owner).toLowerCase() : null;
  const connectedAddr = address ? address.toLowerCase() : null;
  const isOwner = Boolean(isConnected && ownerAddr && connectedAddr === ownerAddr);
  const stt = sttBalance?.value !== undefined ? Number(sttBalance.value) / 1e18 : undefined;
  const canArm = isOwner && stt !== undefined && stt >= ARM_RESERVE_STT;

  // Non-owners get the whole switch disabled; owners short on STT may still disarm.
  const switchDisabled = !isConnected || actions.isPending || (isConnected && !isOwner);

  const handleArmToggle = (next: boolean) => {
    if (next && !canArm) return; // arming needs the owner wallet with ≥ 33 STT
    if (next) actions.armBrain();
    else actions.disarmBrain();
  };

  let armNote: { kind: "faint" | "warning"; text: string } | null = null;
  if (!isConnected) {
    armNote = { kind: "faint", text: "Connect the owner wallet to arm the guardian." };
  } else if (!isOwner) {
    armNote = { kind: "warning", text: "Only the owner wallet can arm/disarm." };
  } else if (stt !== undefined && stt < ARM_RESERVE_STT) {
    armNote = {
      kind: "warning",
      text: `Need ≥ ${ARM_RESERVE_STT} STT in this wallet to arm (you have ${stt.toFixed(2)} STT).`,
    };
  }

  const armHint = brain?.isSubscribed
    ? "Armed — self-wakes every ~5 min"
    : canArm
      ? `Sends ${ARM_RESERVE_STT} STT as the reactivity reserve`
      : null;

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
      className={styles.main}
    >
      <motion.div variants={fadeUp}>
        <PageHeader
          eyebrow="Live dashboard"
          title="Portfolio guardian"
          description="The on-chain agent in real time — status, market odds and every hedge it has placed."
          actions={<Pulse tone="success" label="Live" />}
        />
      </motion.div>

      {/* System status strip — glanceable KPIs */}
      <motion.div variants={fadeUp}>
        <div className={styles.strip} role="group" aria-label="Agent status">
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Agent state</span>
            <span className={styles.kpiState}>
              <Badge tone={stateTone} dot>{stateName}</Badge>
              <Pulse tone={stateTone} live={stateName !== "Idle"} />
            </span>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Position</span>
            <Badge tone={brain?.positionOpen ? "accent" : "neutral"} dot>
              {brain?.positionOpen ? "position open" : "no position"}
            </Badge>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Subscription</span>
            <Badge tone={brain?.isSubscribed ? "success" : "neutral"} dot>
              {brain?.isSubscribed ? "armed · subscribed" : "not subscribed"}
            </Badge>
          </div>
          <div className={styles.kpi}>
            <span className={styles.kpiLabel}>Loss streak</span>
            <span className={styles.kpiValue}>{brain?.lossStreak?.toString() ?? "–"}</span>
          </div>
        </div>
      </motion.div>

      <Grid cols={2} gap={4}>
        {/* Agent — status + arm control */}
        <motion.div variants={fadeUp}>
          <Card title="Agent" subtitle={shortHash(ADDRESSES.brain)}>
            <Stack gap={4}>
              <div className={styles.row}>
                <Badge tone={stateTone} dot>{stateName}</Badge>
                {brain?.positionOpen && <Badge tone="accent" dot>position open</Badge>}
                {brain?.isSubscribed
                  ? <Badge tone="success" dot>armed</Badge>
                  : <Badge tone="neutral">disarmed</Badge>}
              </div>

              <div className={`${styles.armPanel} ${patterns.gridLines}`}>
                <div className={styles.armRow}>
                  <Switch
                    checked={!!brain?.isSubscribed}
                    onCheckedChange={handleArmToggle}
                    disabled={switchDisabled}
                    label={brain?.isSubscribed ? "Armed" : "Arm the guardian"}
                  />
                  {actions.isPending && <span className={styles.armPending}>broadcasting…</span>}
                </div>
                {armNote && (
                  <p className={armNote.kind === "warning" ? styles.noteWarning : styles.noteFaint}>
                    {armNote.text}
                  </p>
                )}
                {armHint && !armNote && <p className={styles.armHint}>{armHint}</p>}
                {actions.error && (
                  <p className={styles.armError} role="alert">
                    {actions.error.message || "Transaction failed."}
                  </p>
                )}
              </div>

              <div className={styles.statsRow}>
                <Stat label="Open nonce" value={String(brain?.lastOrderNonce ?? "–")} />
                <Stat
                  label="Open qty"
                  value={brain?.lastOrderQtyRaw ? formatUsdc(brain.lastOrderQtyRaw) : "–"}
                  sub="outcome tokens"
                />
              </div>
            </Stack>
          </Card>
        </motion.div>

        {/* Vault */}
        <motion.div variants={fadeUp}>
          <Card title="Vault" subtitle={shortHash(ADDRESSES.vault)}>
            <Stack gap={5}>
              <div className={styles.heroStat}>
                <span className={styles.heroLabel}>Collateral</span>
                <span className={styles.heroValue}>
                  {vault ? formatUsdc(vault.tusdcBalanceRaw) : "–"}
                </span>
                <span className={styles.heroSub}>tUSDC held by the vault</span>
              </div>
              <div className={styles.row}>
                {vault?.paused && <Badge tone="danger" dot>paused</Badge>}
                <Badge tone="neutral">
                  premium cap {vault ? formatUsdc(vault.maxPremiumPerWindowRaw) : "–"}/window
                </Badge>
              </div>
              <div className={styles.statsRow}>
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
              <div className={styles.meterBlock}>
                <div className={styles.meterHeader}>
                  <span className={styles.meterLabel}>Premium budget used</span>
                  <span className={styles.meterValue}>
                    {vault
                      ? `${formatUsdc(vault.windowPremiumSpentRaw)} / ${formatUsdc(vault.maxPremiumPerWindowRaw)}`
                      : "– / –"}
                  </span>
                </div>
                <div className={styles.meter} aria-hidden="true">
                  <motion.div
                    className={styles.meterFill}
                    animate={{ width: `${budgetPct}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </Stack>
          </Card>
        </motion.div>

        {/* Live market */}
        <motion.div variants={fadeUp}>
          <Card title="Live market" subtitle={vault?.poolAddress ? shortHash(vault.poolAddress) : "no pool set"}>
            {book ? (
              <Stack gap={5}>
                <div className={styles.oddsBlock}>
                  <div className={styles.oddsHeader}>
                    <span className={styles.oddsUpLabel}>
                      Up {pUp !== null ? formatPctRaw(book.pUpRaw) : "–"}
                    </span>
                    <span className={styles.oddsDownLabel}>
                      Down {pDown !== null ? formatPctRaw(book.pDownRaw) : "–"}
                    </span>
                  </div>
                  <div className={styles.oddsBar} aria-hidden="true">
                    <motion.div
                      className={styles.oddsUp}
                      animate={{ width: `${upPct}%` }}
                      transition={{ duration: 0.5 }}
                    />
                    <motion.div
                      className={styles.oddsDown}
                      animate={{ width: `${downPct}%` }}
                      transition={{ duration: 0.5 }}
                    />
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
              <div className={!isConnected ? styles.slidersDisabled : undefined} aria-disabled={!isConnected}>
                <Stack gap={4}>
                  <Slider
                    label="Insured move"
                    value={moveBps}
                    min={50}
                    max={1000}
                    step={25}
                    formatValue={(v) => `${v} bps`}
                    onValueChange={(v) => {
                      if (isConnected) setMoveBps(v);
                    }}
                  />
                  <Slider
                    label="Down price"
                    value={downBps}
                    min={1000}
                    max={9000}
                    step={100}
                    formatValue={(v) => formatPctRaw(BigInt(v * 100))}
                    onValueChange={(v) => {
                      if (isConnected) setDownBps(v);
                    }}
                  />
                </Stack>
              </div>
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
                  {isConnected
                    ? `on-chain: move ${moveBpsOnChain?.toString() ?? "–"} bps · down ${
                        downBpsOnChain?.toString() ?? "–"
                      } bps`
                    : "Connect wallet to save thresholds"}
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
            <div className={styles.empty}>
              <span className={styles.emptyTitle}>No hedges yet</span>
              <span>Hedge events will appear here as the agent acts.</span>
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th className={styles.num}>Block</th>
                    <th>Details</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((e) => (
                    <tr key={`${e.transactionHash}-${e.logIndex}`}>
                      <td><Badge tone={EVENT_TONE[e.kind] ?? "neutral"}>{e.kind}</Badge></td>
                      <td className={styles.num}>{e.blockNumber?.toString() ?? "–"}</td>
                      <td className={styles.details}>{e.summary ?? "–"}</td>
                      <td className={styles.tx}>
                        {e.transactionHash ? shortHash(e.transactionHash) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>
    </motion.main>
  );
}
