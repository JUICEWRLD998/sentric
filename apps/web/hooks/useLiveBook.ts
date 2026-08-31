"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { fetchBook, type BookData } from "@/lib/book";

/**
 * Live order-book snapshot for a pool, polled every 15s.
 * Returns the react-query result; `data` is BookData | null (null while
 * the pool address is unknown or on first load).
 */
export function useLiveBook(poolAddress?: Address | string) {
  const address = poolAddress ? (poolAddress as Address) : null;

  return useQuery<BookData | null>({
    queryKey: ["liveBook", address ?? null],
    queryFn: async () => (address ? fetchBook(address) : null),
    enabled: Boolean(address),
    placeholderData: null,
    refetchInterval: 15_000,
    retry: 1,
    staleTime: 5_000,
  });
}
