"use client";

import { useEffect, useState } from "react";
import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortHash } from "@/lib/format";
import { Button } from "@/components/ui";
import styles from "./connect-button.module.css";

export default function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button size="sm" variant="ghost" disabled>Connect</Button>;
  }

  if (isConnected && address) {
    return (
      <div className={styles.wrap}>
        <span className={styles.balance} title="STT balance">
          {balance ? Number(balance.formatted).toFixed(2) : "–"} STT
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => disconnect()}
          title={address}
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
