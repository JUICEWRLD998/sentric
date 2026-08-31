import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { chain } from "./chain";
import { CHAIN_ID, RPC_URL } from "./config";

export const wagmiConfig = createConfig({
  chains: [chain],
  transports: {
    [CHAIN_ID]: http(RPC_URL, { retryCount: 3 }),
  },
  connectors: [injected()],
});
