"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ConnectButton from "./connect-button";
import styles from "./nav.module.css";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/reason-explorer", label: "Reason Explorer" },
  { href: "/styleguide", label: "Styleguide" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>
        <span className={styles.brandMark} aria-hidden="true" />
        Sentric
      </Link>
      <nav className={styles.links} aria-label="Main">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={pathname === l.href ? `${styles.link} ${styles.active}` : styles.link}
            aria-current={pathname === l.href ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <ConnectButton />
    </header>
  );
}
