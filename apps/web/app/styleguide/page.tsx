import Link from "next/link";
import patterns from "../patterns.module.css";
import styles from "./styleguide.module.css";

/* Noviq UI Playbook §11 — the living reference: renders every ramp, the
   fluid type scale, and the four surface patterns so the system is verifiable. */

const NEUTRALS = ["990","950","900","850","800","700","600","500","400","300","200","100","50"];
const VIOLETS = ["200","300","400","500","600","700"];
const STATUS = [
  ["red","300"],["red","400"],["red","500"],["red","600"],
  ["green","300"],["green","400"],["green","500"],["green","600"],
  ["amber","400"],["amber","500"],
];

const SURFACES: [string, string][] = [
  ["surface-0","var(--neutral-990)"],
  ["surface-1","var(--neutral-950)"],
  ["surface-2","var(--neutral-900)"],
  ["surface-3","var(--neutral-850)"],
  ["surface-inset","var(--neutral-800)"],
];
const TEXT: [string, string][] = [
  ["text-primary","var(--neutral-50)"],
  ["text-secondary","var(--neutral-300)"],
  ["text-muted","var(--neutral-400)"],
  ["text-faint","var(--neutral-500)"],
  ["text-inverse","var(--neutral-990)"],
];
const ACCENTS: [string, string][] = [
  ["accent","var(--violet-500)"],
  ["accent-hover","var(--violet-400)"],
  ["accent-active","var(--violet-600)"],
  ["danger","var(--red-500)"],
  ["success","var(--green-500)"],
  ["warning","var(--amber-500)"],
];

const TYPE_SCALE = [
  ["--fs-step--1","caption"],
  ["--fs-step-0","body"],
  ["--fs-step-1",""],
  ["--fs-step-2",""],
  ["--fs-step-3",""],
  ["--fs-step-4",""],
  ["--fs-step-5",""],
  ["--fs-step-6","display hero"],
];

const EASINGS = [
  ["--ease-out-expo","cubic-bezier(0.16, 1, 0.3, 1)"],
  ["--ease-out-quart","cubic-bezier(0.25, 1, 0.5, 1)"],
  ["--ease-in-out","cubic-bezier(0.65, 0, 0.35, 1)"],
  ["--ease-spring","cubic-bezier(0.34, 1.56, 0.64, 1)"],
];
const DURATIONS = [
  ["--dur-1","120ms"],["--dur-2","200ms"],["--dur-3","320ms"],
  ["--dur-4","500ms"],["--dur-5","800ms"],
];

function Ramp({ items, prefix }: { items: string[]; prefix: string }) {
  return (
    <div className={styles.grid}>
      {items.map((step) => {
        const name = `${prefix}-${step}`;
        return (
          <div key={name} className={styles.swatch}>
            <div
              className={styles.swatchChip}
              style={{ background: `var(--${name})` }}
            />
            <div className={styles.swatchMeta}>
              <div className={styles.swatchName}>{name}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Semantic({ items }: { items: [string, string][] }) {
  return (
    <div className={styles.grid}>
      {items.map(([name, value]) => (
        <div key={name} className={styles.swatch}>
          <div
            className={styles.swatchChip}
            style={{ background: `var(--${name})` }}
          />
          <div className={styles.swatchMeta}>
            <div className={styles.swatchName}>{name}</div>
            <div className={styles.swatchValue}>{value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Styleguide() {
  return (
    <div className={styles.wrap}>
      <Link href="/" className={styles.back}>
        ← back to Sentric
      </Link>
      <h1 className={styles.h1}>Styleguide</h1>
      <p className={styles.lede}>
        The Noviq dark-first design system — OKLCH tokens, three-tier
        architecture, fluid type, and the four reusable surface patterns.
      </p>

      <section className={styles.section}>
        <h2 className={styles.h2}>Color primitives · neutral ramp (hue 265)</h2>
        <Ramp items={NEUTRALS} prefix="neutral" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Color primitives · accent violet (hue 285)</h2>
        <Ramp items={VIOLETS} prefix="violet" />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Color primitives · status (danger / success / warning)</h2>
        <div className={styles.grid}>
          {STATUS.map(([hue, step]) => {
            const name = `${hue}-${step}`;
            return (
              <div key={name} className={styles.swatch}>
                <div
                  className={styles.swatchChip}
                  style={{ background: `var(--${name})` }}
                />
                <div className={styles.swatchMeta}>
                  <div className={styles.swatchName}>{name}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Semantic roles · surfaces</h2>
        <Semantic items={SURFACES} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Semantic roles · text</h2>
        <Semantic items={TEXT} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Semantic roles · accent &amp; status</h2>
        <Semantic items={ACCENTS} />
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Fluid type scale (clamp)</h2>
        <div>
          {TYPE_SCALE.map(([token, note]) => (
            <div key={token} className={styles.typeRow}>
              <span className={styles.typeLabel}>
                {token} {note && <em>({note})</em>}
              </span>
              <span
                className={styles.typeSample}
                style={{ fontSize: `var(${token})` }}
              >
                Sentric guards the next 15 minutes.
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Surface patterns</h2>
        <div className={styles.demoGrid}>
          <div>
            <div className={`${patterns.glassCard} ${styles.demoBox}`}>
              glassCard
            </div>
            <div className={styles.demoLabel}>glassCard</div>
          </div>
          <div>
            <div className={`${patterns.edgeLight} ${styles.demoBox}`}>
              edgeLight
            </div>
            <div className={styles.demoLabel}>edgeLight</div>
          </div>
          <div>
            <div className={`${patterns.filmGrain} ${styles.demoBox}`}>
              filmGrain
            </div>
            <div className={styles.demoLabel}>filmGrain</div>
          </div>
          <div>
            <div className={styles.demoBox}>
              <div className={patterns.mesh} />
              mesh
            </div>
            <div className={styles.demoLabel}>mesh (static)</div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>Motion tokens (mirrored in lib/motion.ts)</h2>
        <div className={styles.tokenList}>
          {EASINGS.map(([token, value]) => (
            <span key={token} className={styles.tokenChip}>
              {token} · {value}
            </span>
          ))}
          {DURATIONS.map(([token, value]) => (
            <span key={token} className={styles.tokenChip}>
              {token} · {value}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
