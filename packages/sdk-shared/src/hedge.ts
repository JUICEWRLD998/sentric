/**
 * Pure hedge-sizing helpers for Sentric.
 *
 * Reference: implementation.md §4.2 / §6.1.
 *
 * A long portfolio hedges a drop by buying Down Event Contracts. Each contract pays
 * out a fixed `1` (in USDso) if the adverse move happens, and its price is the
 * probability of that side (P(Down) = 1 - P(Up)). Therefore:
 *
 *   - hedge size (notional of contracts) = exposure × hedgeRatio
 *   - premium paid = hedge size × price          (this is the *most* that can be lost)
 *   - max premium  = exposure × maxPremiumFraction  (safety rail, capped per window)
 */

export interface HedgeRequest {
  /** Notional at risk, e.g. the USDso value of the protected position. */
  exposure: number;
  /**
   * Current price (probability) of the hedge leg, in (0, 1).
   * For a Down hedge this is `downPrice(upPrice)`.
   */
  price: number;
  /** Fraction of exposure to hedge. Defaults to 1 (full hedge). */
  hedgeRatio?: number;
  /**
   * Cap on the premium, expressed as a fraction of exposure (the "max loss per window"
   * safety rail). Defaults to 0.05 (5%).
   */
  maxPremiumFraction?: number;
}

export interface HedgePlan {
  /** Notional of hedge contracts to buy. */
  hedgeSize: number;
  /** Premium actually paid (never exceeds `maxPremium`). */
  premium: number;
  /** The most that can be lost this window (the premium cap). */
  maxPremium: number;
  /** True when the desired premium was clipped by `maxPremiumFraction`. */
  capped: boolean;
}

/**
 * The raw (uncapped) hedge size for a given exposure and hedge ratio.
 * Scales linearly with exposure.
 */
export function hedgeSize(exposure: number, hedgeRatio = 1): number {
  return exposure * hedgeRatio;
}

/** The premium paid for a hedge of a given size at a given leg price. */
export function premiumFor(size: number, price: number): number {
  return size * price;
}

/**
 * The maximum premium allowed for a window (the most that can be lost),
 * as a fraction of exposure.
 */
export function maxPremium(exposure: number, maxPremiumFraction = 0.05): number {
  return exposure * maxPremiumFraction;
}

/**
 * Computes a complete hedge plan: the hedge size and the max premium (the most that
 * can be lost). If the desired premium would exceed the `maxPremiumFraction` safety
 * cap, the size is scaled down so the premium sits exactly at the cap.
 */
export function planHedge(req: HedgeRequest): HedgePlan {
  if (!(req.price > 0)) {
    throw new Error(`Hedge price must be in (0, 1); got ${req.price}.`);
  }

  const ratio = req.hedgeRatio ?? 1;
  const maxFrac = req.maxPremiumFraction ?? 0.05;

  const desiredSize = hedgeSize(req.exposure, ratio);
  const desiredPremium = premiumFor(desiredSize, req.price);
  const cap = maxPremium(req.exposure, maxFrac);

  const capped = desiredPremium > cap;
  const premium = Math.min(desiredPremium, cap);
  const size = premium / req.price;

  return { hedgeSize: size, premium, maxPremium: cap, capped };
}

/**
 * Decides whether to hedge based on a simple sigma-threshold rule.
 *
 * `change5mPct` is the 5-minute percentage change (negative = a drop),
 * `volSigma` is the magnitude of that move measured in sigma units (e.g. `4.2`),
 * and `threshold` is the sigma level above which a drop is treated as "elevated risk".
 *
 * Returns `true` only when the move is adverse (a drop) AND its sigma magnitude
 * reaches the threshold.
 *
 * Example (from the demo receipt): `shouldHedge(-2.1, 4.2, 3.0) === true`.
 */
export function shouldHedge(
  change5mPct: number,
  volSigma: number,
  threshold: number
): boolean {
  return change5mPct < 0 && Math.abs(volSigma) >= threshold;
}
