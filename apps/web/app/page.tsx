'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { easings, fadeUp, fadeUpSm, staggerParent } from '@/lib/motion';
import { Badge, Pulse, SectionHeading, Skeleton, Stat } from '@/components/ui';
import { useAuditHistory, useBrainState, useLiveBook, useVaultState } from '@/hooks';
import { ADDRESSES } from '@/lib/config';
import { formatPctRaw, formatUsdc, shortHash } from '@/lib/format';
import patterns from './patterns.module.css';
import styles from './landing.module.css';

const STEPS = [
  {
    n: '01',
    title: 'Observe',
    body: 'The contract wakes itself every ~5 minutes through Somnia reactivity — no keeper, no server, no oracle middleware.',
  },
  {
    n: '02',
    title: 'Decide',
    body: 'It fetches the live BTC price and an on-chain LLM picks HEDGE, STAND_DOWN or HOLD — with a confidence score.',
  },
  {
    n: '03',
    title: 'Hedge',
    body: 'On HEDGE it buys a Down Event Contract sized to the exposure, bounded by per-window and per-day premium budgets.',
  },
  {
    n: '04',
    title: 'Redeem',
    body: 'Settled winnings are redeemed automatically. Every step of the loop leaves an on-chain AuditEvent receipt.',
  },
];

const RAILS = [
  ['Non-custodial vault', 'Deposits are yours; the agent can only hedge, never move funds out.'],
  ['Hard safety rails', 'Max premium per window and per day, a pause circuit breaker, and a loss-streak stop-loss.'],
  ['No keepers', 'EpochTick self-wake means the guardian acts even if nobody is watching.'],
  ['Every decision auditable', 'The Reason Explorer renders each receipt — inputs, decision, confidence, on-chain.'],
];

const FACTS = [
  ['71/71', 'forge tests pass'],
  ['100%', 'on-chain — no server, API key or oracle'],
  ['~5 min', 'self-waking cadence'],
] as const;

export default function Landing() {
  const brain = useBrainState(ADDRESSES.brain);
  const vault = useVaultState();
  const book = useLiveBook(vault?.poolAddress)?.data ?? null;
  const receipts = useAuditHistory(ADDRESSES.brainV2, 5);
  const latest = receipts && receipts.length > 0 ? receipts[0] : null;

  const pUp = book?.pUpRaw ? Number(book.pUpRaw) / 1e6 : null;
  const pDown = book?.pDownRaw ? Number(book.pDownRaw) / 1e6 : null;
  const upWidth = pUp !== null ? `${Math.round(pUp * 1000) / 10}%` : '50%';

  return (
    <>
      {/* Full-bleed static background: mesh gradient + film grain. */}
      <div className={`${patterns.mesh} ${patterns.filmGrain}`} aria-hidden='true' />

      <motion.main
        variants={staggerParent(0.08)}
        initial='hidden'
        animate='show'
        className={styles.main}
      >
        {/* ------------------------------------------------------------ hero */}
        <motion.section variants={fadeUp} className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Autonomous portfolio insurance · Somnia</p>
            <h1 className={styles.title}>
              Your portfolio
              <br />
              guards <span className={styles.accent}>itself</span>.
            </h1>
            <p className={styles.lede}>
              Sentric is an autonomous insurance agent living on the Somnia blockchain. It
              watches the market, decides when to hedge, buys Down Event Contracts — and shows
              you the receipt for every decision.
            </p>
            <div className={styles.actions}>
              <Link className={styles.ctaPrimary} href='/dashboard'>
                Open the dashboard
              </Link>
              <Link className={styles.ctaSecondary} href='/reason-explorer'>
                Read the reasoning
              </Link>
            </div>
          </div>

          {/* Guardian console — the live product surface. */}
          <motion.aside
            variants={fadeUpSm}
            className={styles.console}
            aria-label='Guardian console'
          >
            <div className={`${styles.consoleGrid} ${patterns.gridLines}`} aria-hidden='true' />

            <header className={styles.consoleHead}>
              <span className={styles.consoleTitle}>Guardian console</span>
              <span className={styles.consoleMeta}>{shortHash(ADDRESSES.brain)}</span>
            </header>

            <div className={styles.consoleBody}>
              <div className={styles.consoleRow}>
                <span className={styles.consoleLabel}>agent</span>
                <div className={styles.consoleCell}>
                  <div className={styles.consoleAgent}>
                    <Pulse
                      tone={brain?.positionOpen ? 'accent' : 'neutral'}
                      live={Boolean(brain?.isSubscribed)}
                      label={brain?.positionOpen ? 'Hedging' : 'Standing by'}
                    />
                    {brain?.isSubscribed ? (
                      <Badge tone='success' dot>
                        subscribed
                      </Badge>
                    ) : (
                      <Badge tone='neutral'>awaiting arm</Badge>
                    )}
                  </div>
                  <span className={styles.consoleHint}>cycle state · {brain?.stateName ?? '–'}</span>
                </div>
              </div>

              <div className={styles.consoleRow}>
                <span className={styles.consoleLabel}>market odds</span>
                {book ? (
                  <div className={styles.consoleCell}>
                    <div className={styles.odds}>
                      <div className={styles.oddsBar} aria-hidden='true'>
                        <motion.div
                          className={styles.oddsUp}
                          animate={{ width: upWidth }}
                          transition={{ duration: 0.6, ease: easings.outExpo }}
                        />
                        <div className={styles.oddsDown} />
                      </div>
                      <div className={styles.oddsLabels}>
                        <span className={styles.oddsUpLabel}>
                          Up {pUp !== null ? formatPctRaw(book.pUpRaw) : '–'}
                        </span>
                        <span className={styles.oddsDownLabel}>
                          Down {pDown !== null ? formatPctRaw(book.pDownRaw) : '–'}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Skeleton lines={2} />
                )}
              </div>

              <div className={styles.consoleRow}>
                <span className={styles.consoleLabel}>vault</span>
                <div className={styles.consoleCell}>
                  <div className={styles.consoleVault}>
                    <Stat
                      label='collateral'
                      value={vault ? formatUsdc(vault.tusdcBalanceRaw) : '–'}
                      sub='tUSDC'
                      tone='success'
                    />
                    <Stat
                      label='premium today'
                      value={vault ? formatUsdc(vault.dailyPremiumSpentRaw) : '–'}
                      sub='budgeted daily'
                    />
                  </div>
                </div>
              </div>

              <div className={styles.consoleRow}>
                <span className={styles.consoleLabel}>last decision</span>
                {latest ? (
                  <div className={styles.consoleCell}>
                    <div className={styles.consoleDecision}>
                      <Badge tone={latest.decision === 'HEDGE' ? 'danger' : 'success'} dot>
                        {latest.decision}
                      </Badge>
                      <span className={styles.consoleConf}>confidence {latest.confidence}/100</span>
                      <span className={styles.consoleHash}>
                        {shortHash(latest.inputsHash)} · block {latest.blockNumber.toString()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <Skeleton lines={2} />
                )}
              </div>
            </div>
          </motion.aside>
        </motion.section>

        {/* -------------------------------------------------------- the loop */}
        <motion.section variants={fadeUp} className={styles.section}>
          <SectionHeading
            eyebrow='How it works'
            title='A guardian that never sleeps'
            description='Four steps, every ~5 minutes, entirely on-chain.'
          />
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

        {/* --------------------------------------------------- live proof */}
        <motion.section variants={fadeUp} className={styles.section}>
          <SectionHeading
            eyebrow='Proven on testnet'
            title='Real receipts, real payouts'
            description='Sentric already placed live hedges on the Somnia testnet and redeemed winning positions — every one of them verifiable in the Reason Explorer.'
          />
          <div className={styles.proofFacts}>
            {FACTS.map(([value, label]) => (
              <div key={label} className={styles.fact}>
                <span className={styles.factValue}>{value}</span>
                <span className={styles.factLabel}>{label}</span>
              </div>
            ))}
          </div>
          <div className={styles.proof}>
            <div className={styles.receipt}>
              <div className={styles.receiptHead}>
                <span className={styles.receiptLabel}>Audit receipt</span>
                {latest && (
                  <Badge tone={latest.decision === 'HEDGE' ? 'danger' : 'success'} dot>
                    {latest.decision}
                  </Badge>
                )}
              </div>
              {latest ? (
                <>
                  <dl className={styles.receiptFields}>
                    <div className={styles.receiptField}>
                      <dt className={styles.receiptKey}>confidence</dt>
                      <dd className={styles.receiptVal}>{latest.confidence}/100</dd>
                    </div>
                    <div className={styles.receiptField}>
                      <dt className={styles.receiptKey}>block</dt>
                      <dd className={styles.receiptVal}>{latest.blockNumber.toString()}</dd>
                    </div>
                    <div className={styles.receiptField}>
                      <dt className={styles.receiptKey}>asset</dt>
                      <dd className={styles.receiptVal}>{shortHash(latest.asset)}</dd>
                    </div>
                    <div className={styles.receiptField}>
                      <dt className={styles.receiptKey}>tx</dt>
                      <dd className={styles.receiptVal}>{shortHash(latest.transactionHash)}</dd>
                    </div>
                    <div className={`${styles.receiptField} ${styles.receiptWide}`}>
                      <dt className={styles.receiptKey}>inputsHash</dt>
                      <dd className={styles.receiptVal}>{shortHash(latest.inputsHash)}</dd>
                    </div>
                  </dl>
                  <Link className={styles.textLink} href='/reason-explorer'>
                    Open the full audit trail →
                  </Link>
                </>
              ) : (
                <Skeleton lines={3} />
              )}
            </div>

            <div className={styles.rails}>
              {RAILS.map(([title, body]) => (
                <div key={title} className={styles.rail}>
                  <span className={styles.railTitle}>{title}</span>
                  <span className={styles.railBody}>{body}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ------------------------------------------------------- closing */}
        <motion.section variants={fadeUp} className={styles.closing}>
          <h2 className={styles.closingTitle}>Stop watching the charts. Sentric does.</h2>
          <div className={styles.actions}>
            <Link className={styles.ctaPrimary} href='/dashboard'>
              Go to the dashboard
            </Link>
            <Link className={styles.ctaSecondary} href='/reason-explorer'>
              Explore the receipts
            </Link>
          </div>
        </motion.section>
      </motion.main>
    </>
  );
}
