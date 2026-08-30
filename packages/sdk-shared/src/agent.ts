/**
 * Somnia Agent request encoding — STUBS ONLY.
 *
 * Reference: implementation.md §6.2 (Somnia Agents) and §6.4 (venue entry point).
 *
 * These helpers let higher layers compile against a stable interface today while the
 * real platform-contract ABI is still unconfirmed. The actual ABI-encoding (viem's
 * `encodeFunctionData` / ethers `Interface`) must replace `placeholderAbiEncode`
 * before any request is sent on-chain.
 *
 * TODO(abi): confirm the Somnia Agents platform-contract ABI and swap these stubs for
 * real ABI encoding. Until then every function returns a *deterministic* hex
 * placeholder so the module still type-checks and produces byte-identical output for
 * the same inputs (required for consensus-verified, reproducible agent calls).
 */

/** Kinds of Somnia Agents Sentric uses. */
export type AgentKind = 'json-api' | 'llm';

/** Request shape for the JSON API agent (fetch + parse a public HTTP endpoint). */
export interface JsonApiRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: unknown;
  /** JSONPath-style pointer to extract a single field from the response. */
  jsonPath?: string;
}

/** Request shape for the LLM inference agent (deterministic Qwen3-30B). */
export interface LlmInferenceRequest {
  prompt: string;
  /** Constrained output set, e.g. `['HEDGE', 'STAND-DOWN', 'HOLD']`. */
  constrainedOutputs: string[];
  /** Must be 0 for consensus-deterministic output. */
  temperature?: 0;
  seed?: number;
}

/** FNV-1a (32-bit) — a small, dependency-free, deterministic hash. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Encodes a UTF-8 string as lowercase hex (no `0x` prefix). */
function utf8ToHex(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    out += input.charCodeAt(i).toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Deterministic placeholder for ABI encoding. Returns a stable `0x`-prefixed hex
 * string derived from the function signature and its arguments.
 *
 * TODO(abi): replace with real ABI encoding once the Somnia Agents ABI is confirmed.
 * The current output is a placeholder only and MUST NOT be broadcast on-chain.
 */
export function placeholderAbiEncode(signature: string, args: unknown[]): string {
  const selector = fnv1a(signature).toString(16).padStart(8, '0');
  const body = utf8ToHex(JSON.stringify(args));
  return `0x${selector}${body}`;
}

/** Encodes a JSON API agent request as ABI bytes (placeholder). */
export function encodeJsonApiRequest(req: JsonApiRequest): string {
  // TODO(abi): encode against the confirmed JSON-API agent request ABI (§6.2).
  return placeholderAbiEncode('requestJsonApi((string,string,string,bytes))', [
    req.url,
    req.method ?? 'GET',
    req.jsonPath ?? '',
    req.body ?? null,
  ]);
}

/** Encodes an LLM inference agent request as ABI bytes (placeholder). */
export function encodeLlmInferenceRequest(req: LlmInferenceRequest): string {
  // TODO(abi): encode against the confirmed LLM inference agent request ABI (§6.2).
  return placeholderAbiEncode('requestLlm((string,string[],uint8,uint256))', [
    req.prompt,
    req.constrainedOutputs,
    req.temperature ?? 0,
    req.seed ?? 0,
  ]);
}
