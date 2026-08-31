import { defineChain } from "viem";
import { CHAIN_ID, RPC_URL } from "./config";

/**
 * Somnia Testnet (chainId 50312).
 * RPC is flaky — transports built on top add their own retryCount.
 */
export const chain = defineChain({
  id: CHAIN_ID,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
});

export { chain as somniaTestnet };
