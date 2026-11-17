"use client";

import { useEffect } from "react";

/** Writes a cookie once the page has been seen, scoped to this account's pages. */
export function MarkSeen({ name, value, path }: { name: string; value: string; path: string }) {
  useEffect(() => {
    document.cookie = `${name}=${encodeURIComponent(value)}; path=${path}; max-age=31536000; samesite=lax`;
  }, [name, value, path]);
  return null;
}
