"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";     // opt out of SSG/ISR for this page
export const revalidate = 0;                // (belt + suspenders)
export const viewport = { themeColor: "#ffffff" }; // moved from metadata

function CallbackInner() {
  const r = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const s = sp.get("s");
    if (!s) { r.replace("/"); return; }

    (async () => {
      // Call your Worker finalize endpoint to set the partitioned cookie
      await fetch(
        `${process.env.NEXT_PUBLIC_API_BASE}/api/auth/finalize?s=${encodeURIComponent(s)}`,
        { credentials: "include" } // important so cookie is accepted
      );
      r.replace("/"); // go back to the app after cookie is set
    })();
  }, [r, sp]);

  return null;
}

export default function CallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}