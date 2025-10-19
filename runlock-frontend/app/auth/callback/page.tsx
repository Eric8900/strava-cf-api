"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function Callback() {
  const r = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const s = sp.get("s");
    if (!s) { r.replace("/"); return; }
    (async () => {
      await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/finalize?s=${encodeURIComponent(s)}`, {
        credentials: "include",
        mode: "cors",
      });
      r.replace("/"); // cookie now stored in the app partition
    })();
  }, [r, sp]);

  return null;
}