"use client";

import { useSyncExternalStore } from "react";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortHash } from "@/lib/format";
import { Button } from "@/components/ui";
import styles from "./connect-button.module.css";

const emptySubscribe = () => () => {};

export default function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  // true on the client, false during SSR — no setState-in-effect.
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

  if (!mounted) {
    return (
      <Button size="sm" variant="primary" disabled>
        Connect wallet
      </Button>
    );
  }

  if (isConnected && address) {
    const stt = balance ? Number(balance.value) / 1e18 : null;
    return (
      <div className={styles.wrap}>
        <span className={styles.balance} title="STT balance">
          {stt !== null ? stt.toFixed(2) : "–"} STT
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => disconnect()}
        >
          {shortHash(address)}
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="primary"
      loading={isPending}
      onClick={() => connect({ connector: injected() })}
    >
      Connect wallet
    </Button>
  );
}
