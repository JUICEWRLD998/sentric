"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Pulse } from "@/components/ui";
import ConnectButton from "./connect-button";
import { ThemeToggle } from "./theme-toggle";
import styles from "./nav.module.css";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reason-explorer", label: "Reason Explorer" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <Logo href="/" />
      <nav className={styles.links} aria-label="Main">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={
              pathname === l.href
                ? `${styles.link} ${styles.active}`
                : styles.link
            }
            aria-current={pathname === l.href ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className={styles.right}>
        <span className={styles.status}>
          <span className={styles.statusName}>Somnia</span>
          <Pulse tone="success" label="testnet" />
        </span>
        <ThemeToggle />
        <ConnectButton />
      </div>
    </header>
  );
}
