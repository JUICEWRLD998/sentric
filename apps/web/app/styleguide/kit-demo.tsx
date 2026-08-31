"use client";

import { useState } from "react";
import {
  Button,
  Badge,
  Card,
  Stat,
  CodeBlock,
  Skeleton,
  Field,
  Input,
  Slider,
  Switch,
  Stack,
  Grid,
} from "@/components/ui";
import styles from "./kit-demo.module.css";

export default function KitDemo() {
  const [on, setOn] = useState(false);
  const [move, setMove] = useState(200);
  const [value, setValue] = useState("");

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        <Button size="sm">Primary</Button>
        <Button size="sm" variant="secondary">Secondary</Button>
        <Button size="sm" variant="ghost">Ghost</Button>
        <Button size="sm" variant="danger">Danger</Button>
        <Button size="sm" variant="primary" loading>Loading</Button>
      </div>

      <div className={styles.row}>
        <Badge tone="neutral">neutral</Badge>
        <Badge tone="accent" dot>accent</Badge>
        <Badge tone="success" dot>success</Badge>
        <Badge tone="warning" dot>warning</Badge>
        <Badge tone="danger" dot>danger</Badge>
      </div>

      <Grid cols={2} gap={4}>
        <Card title="Card" subtitle="glass + edge-light" tone="success">
          <Stack gap={3}>
            <div className={styles.statsRow}>
              <Stat label="Equity" value="10,008.24" tone="success" />
              <Stat label="Confidence" value="75/100" />
              <Stat label="Premium" value="9.77" sub="tUSDC" />
            </div>
            <Field label="Brain address" hint="switch to any deployed brain">
              <Input mono value={value} onChange={(e) => setValue(e.target.value)} placeholder="0x…" spellCheck={false} />
            </Field>
          </Stack>
        </Card>

        <Card title="Controls" subtitle="Radix primitives, token-styled">
          <Stack gap={4}>
            <Switch checked={on} onCheckedChange={setOn} label="Arm the guardian" />
            <Slider
              label="Insured move"
              value={move}
              min={50}
              max={1000}
              step={25}
              formatValue={(v) => `${v} bps`}
              onValueChange={setMove}
            />
          </Stack>
        </Card>
      </Grid>

      <div className={styles.row}>
        <Skeleton width={120} height={16} />
        <Skeleton width={220} height={16} />
        <Skeleton lines={2} />
      </div>

      <CodeBlock
        label="AuditEvent receipt"
        code={JSON.stringify(
          {
            inputsHash: "0x9f3a…c21e",
            decision: "HOLD",
            confidence: 75,
            asset: "0x0000…0001",
          },
          null,
          2
        )}
      />
    </div>
  );
}
