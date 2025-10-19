// app/auth/callback/page.tsx
"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Do NOT export `revalidate` from a client page.
// These two are enough to prevent prerender/SSG:
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function CallbackInner() {
    const router = useRouter();
    const sp = useSearchParams();

    useEffect(() => {
        const s = sp.get("s");
        if (!s) { router.replace("/"); return; }

        (async () => {
            // Call Worker finalize to set the Partitioned cookie while top-level = your app
            const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE}/api/auth/finalize?s=${encodeURIComponent(s)}`, {
                credentials: "include",
                cache: "no-store",
            });
            try {
                const js = await res.json();
                if (js?.token) sessionStorage.setItem("runlock_token", js.token);
            } catch { }
            router.replace("/");
        })();
    }, [router, sp]);

    return null;
}

export default function CallbackPage() {
    return (
        <Suspense fallback={null}>
            <CallbackInner />
        </Suspense>
    );
}