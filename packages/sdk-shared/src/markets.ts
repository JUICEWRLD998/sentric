/**
 * Somnia Event Contract symbol parsing and Up/Down price math.
 *
 * Reference: implementation.md §6.1 — Event Contracts (`@somnia-chain/markets-sdk`).
 *
 *   - Price = Up probability in (0, 1).
 *   - Symbol format: `"BTC-0-12AUG26-1600/USDso#YES"`.
 *   - One book, two sides: Up and Down trade on a single book; Down price = 1 - Up price.
 *   - Complete sets: 1 USDso = 1 Up + 1 Down.
 */

/** The two underlyings supported by Sentric's hedged assets. */
export type Asset = 'BTC' | 'ETH';

/** YES = the Up leg (price is P(Up)); NO = the Down leg. */
export type Side = 'YES' | 'NO';

export interface ParsedSymbol {
  asset: Asset;
  /** The market window token between the asset and the expiry, e.g. `"0"`. */
  strikeWindow: string;
  /** The expiry date + strike time, e.g. `"12AUG26-1600"`. */
  expiry: string;
  side: Side;
}

/**
 * Parses a Somnia Event Contract symbol such as `"BTC-0-12AUG26-1600/USDso#YES"`
 * into its structured fields.
 *
 * Format: `{ASSET}-{STRIKE_WINDOW}-{EXPIRY_DATE}-{STRIKE_TIME}/{QUOTE}#{YES|NO}`,
 * where the expiry is reported as `{EXPIRY_DATE}-{STRIKE_TIME}`.
 *
 * Handles both the YES (Up) and NO (Down) legs; the NO leg shares the same
 * asset/strikeWindow/expiry and only differs by `side`.
 *
 * @throws {Error} if the symbol is malformed or the asset/side is unrecognized.
 */
export function parseSymbol(symbol: string): ParsedSymbol {
  const match = /^([A-Za-z]+)-([^-]+)-([^/]+)\/[^#]*#(YES|NO)$/.exec(symbol);
  if (!match) {
    throw new Error(
      `Invalid Event Contract symbol: "${symbol}". Expected {ASSET}-{WINDOW}-{EXPIRY}/{QUOTE}#{YES|NO}.`
    );
  }

  // The regex above requires all four capture groups, so they are present when it matches.
  const rawAsset = match[1] as string;
  const strikeWindow = match[2] as string;
  const expiry = match[3] as string;
  const rawSide = match[4] as string;

  const asset = normalizeAsset(rawAsset);
  const side = rawSide as Side;

  return { asset, strikeWindow, expiry, side };
}

function normalizeAsset(raw: string): Asset {
  const upper = raw.toUpperCase();
  if (upper === 'BTC' || upper === 'ETH') {
    return upper as Asset;
  }
  throw new Error(`Unsupported Event Contract asset: "${raw}" (expected BTC or ETH).`);
}

/** Small epsilon used to keep probabilities strictly inside the open (0, 1) interval. */
const PROB_EPS = 1e-12;

/**
 * Clamps a value into the open interval (0, 1), used to keep probabilities valid.
 * (Never returns exactly 0 or 1.)
 */
export function clampProbability(value: number): number {
  return Math.min(1 - PROB_EPS, Math.max(PROB_EPS, value));
}

/**
 * The Down price implied by a given Up price on the single shared order book:
 * `downPrice = 1 - upPrice`, clamped to (0, 1).
 *
 * `downPrice(0.6) === 0.4`.
 */
export function downPrice(upPrice: number): number {
  return clampProbability(1 - upPrice);
}

/**
 * The Up price implied by a given Down price (the inverse complement):
 * `upPrice = 1 - downPrice`, clamped to (0, 1).
 */
export function upPrice(downPriceValue: number): number {
  return clampProbability(1 - downPriceValue);
}

/**
 * The cost (in quote units, USDso) to mint or buy a complete set of `1 Up + 1 Down`.
 * A complete set always sums to exactly `1 - 2*eps` ≈ 1; this helper documents that
 * invariant and is used by the LP/neutral-quote mode.
 */
export function completeSetPrice(upPriceValue: number): number {
  return upPriceValue + downPrice(upPriceValue);
}
