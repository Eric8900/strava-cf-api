"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ""; // fallback allows same-origin dev proxy if you add one later

// Small helper to keep fetch calls consistent
async function apiFetch(path: string, init?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    // Required so the browser sends/receives cookies across origins
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  return res;
}

// ---------- Types ----------
export type Me = {
  cents_locked: number;
  emergency_unlocks_used: number;
};

type Payout = { id: string; activity_id: string; cents: number };

const USD = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function Page() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // amounts to lock/unlock (in dollars, converted to cents)
  const [lockAmount, setLockAmount] = useState("10");
  const [emergencyAmount, setEmergencyAmount] = useState("10");

  // payouts state
  const PAGE_SIZE = 10;
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutErr, setPayoutErr] = useState<string | null>(null);
  const [payoutOffset, setPayoutOffset] = useState(0);

  const emergencyLeft = useMemo(
    () => (me ? Math.max(0, 3 - me.emergency_unlocks_used) : 0),
    [me]
  );

  const refreshMe = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await apiFetch("/api/me", { cache: "no-store" });
      if (res.status === 401) throw new Error("Not signed in. Connect Strava first.");
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Me;
      setMe(data);
    } catch (e: unknown) {
      if (e instanceof Error) setErr(e?.message ?? "Failed to load");
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // payouts loader
  const loadPayouts = useCallback(
    async (opts?: { append?: boolean }) => {
      const append = !!opts?.append;
      setPayoutLoading(true);
      setPayoutErr(null);
      try {
        const offset = append ? payoutOffset : 0;
        const res = await apiFetch(`/api/payouts?limit=${PAGE_SIZE}&offset=${offset}`, {
          cache: "no-store",
        });
        if (res.status === 401) throw new Error("Not signed in. Connect Strava first.");
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as {
          items: Payout[];
          limit: number;
          offset: number;
        };
        setPayouts((prev) => (append ? [...prev, ...data.items] : data.items));
        setPayoutOffset(offset + data.items.length);
      } catch (e: unknown) {
        if (e instanceof Error) setPayoutErr(e?.message ?? "Failed to load payouts");
      } finally {
        setPayoutLoading(false);
      }
    },
    [PAGE_SIZE, payoutOffset]
  );

  useEffect(() => {
    void refreshMe();
    void loadPayouts({ append: false });
  }, [refreshMe, loadPayouts]);

  async function lockFunds() {
    setErr(null);
    const cents = Math.round(parseFloat(lockAmount || "0") * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setErr("Enter a positive amount.");
    const res = await apiFetch("/api/pool/lock", {
      method: "POST",
      body: JSON.stringify({ cents }),
    });
    if (!res.ok) return setErr(await res.text());
    await refreshMe();
    // optional: refresh payouts (in case something changed)
    // await loadPayouts({ append: false });
  }

  async function emergencyUnlock() {
    setErr(null);
    const cents = Math.round(parseFloat(emergencyAmount || "0") * 100);
    if (!Number.isFinite(cents) || cents <= 0) return setErr("Enter a positive amount.");
    const res = await apiFetch("/api/pool/emergency-unlock", {
      method: "POST",
      body: JSON.stringify({ cents }),
    });
    if (!res.ok) return setErr(await res.text());
    await refreshMe();
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">RunLock</h1>
        <div className="flex gap-2">
          {/* IMPORTANT: go directly to backend for OAuth start */}
          <Button asChild variant="default">
            <a href={`${API_BASE}/api/auth/strava/start`}>Connect Strava</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`${API_BASE}/api/auth/logout`}>Logout</a>
          </Button>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Locked Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {loading ? "…" : me ? USD(me.cents_locked) : USD(0)}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>Emergency Unlocks</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="text-lg">
              Used: <span className="font-semibold">{me?.emergency_unlocks_used ?? 0}</span>
            </div>
            <div className="text-lg">
              Left: <span className="font-semibold">{emergencyLeft}</span> / 3
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Manage Funds</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Lock money into your pool</div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  inputMode="decimal"
                  value={lockAmount}
                  onChange={(e) => setLockAmount(e.target.value)}
                  placeholder="10"
                />
                <Button onClick={lockFunds}>Lock</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Example: enter 10 to lock {USD(1000)}.
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Emergency unlock (max 3 lifetime)</div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  inputMode="decimal"
                  value={emergencyAmount}
                  onChange={(e) => setEmergencyAmount(e.target.value)}
                  placeholder="10"
                />
                <Button onClick={emergencyUnlock} disabled={emergencyLeft <= 0}>
                  Unlock
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                You have <strong>{emergencyLeft}</strong> emergency unlock
                {emergencyLeft === 1 ? "" : "s"} left.
              </p>
            </div>
          </div>

          <Separator />

          {/* tip / global error */}
          {err ? <div className="text-sm text-red-600">
            Tip: After a Strava run is saved, your pool pays out automatically ($1/mi up to $5).
          </div> :
            <div className="text-sm text-muted-foreground">
              Tip: After a Strava run is saved, your pool pays out automatically ($1/mi up to $5).
            </div>
          }

          {/* --- Recent payouts section --- */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Recent payouts</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPayoutOffset(0);
                    void loadPayouts({ append: false });
                  }}
                  disabled={payoutLoading}
                >
                  {payoutLoading ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
            </div>

            {payoutErr ? (
              <div className="text-sm text-red-600">No payouts yet.</div>
            ) : payouts.length === 0 && payoutLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : payouts.length === 0 ? (
              <div className="text-sm text-muted-foreground">No payouts yet.</div>
            ) : (
              <ul className="divide-y rounded-md border">
                {payouts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="truncate">
                      <div className="font-medium">Activity #{p.activity_id}</div>
                      <div className="text-muted-foreground text-xs">Payout ID: {p.id}</div>
                    </div>
                    <div className="font-semibold">{USD(p.cents)}</div>
                  </li>
                ))}
              </ul>
            )}

            {/* Load more (shows only if last page was "full") */}
            {payouts.length > 0 && payouts.length % PAGE_SIZE === 0 && (
              <div>
                <Button
                  variant="outline"
                  onClick={() => void loadPayouts({ append: true })}
                  disabled={payoutLoading}
                >
                  {payoutLoading ? "Loading…" : "Load more"}
                </Button>
              </div>
            )}
          </div>
          {/* --- end payouts --- */}
        </CardContent>
      </Card>
    </main>
  );
}