/**
 * Sentric — display formatting helpers.
 * All prices/probabilities are 1e6 raw (1e6 raw = 1 USDC = 100%).
 */

/** 6-decimal raw amount → "10,008.24". */
export function formatUsdc(raw: bigint | number | undefined): string {
  if (raw === undefined) return "–";
  const n = Number(raw) / 1_000_000;
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** 6-decimal raw probability (1e6 = 100%) → "53.4%" (534000 → "53.4%"). */
export function formatPctRaw(raw6: bigint | number): string {
  const n = Number(raw6) / 10_000;
  if (!Number.isFinite(n)) return "–";
  return `${n.toFixed(1)}%`;
}

/** Basis points → percent, e.g. 4500 → "45.00%". */
export function formatBps(bps: number | bigint): string {
  const n = Number(bps) / 100;
  if (!Number.isFinite(n)) return "–";
  return `${n.toFixed(2)}%`;
}

/** "0x1234…abcd" — keeps n hex chars after the 0x prefix and n trailing chars. */
export function shortHash(h: string, n = 4): string {
  if (h.length <= 2 + 2 * n) return h;
  return `${h.slice(0, 2 + n)}…${h.slice(-n)}`;
}

/** Unix seconds → "45s ago" / "2m ago" / "3h ago" / "2d ago". */
export function formatAge(tsSec: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - tsSec);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Unix seconds → "HH:MM:SS" (local time). */
export function formatTs(tsSec: number): string {
  const d = new Date(tsSec * 1000);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
