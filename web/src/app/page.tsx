"use client";

import { useCallback, useEffect, useState } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { CreateBountyForm } from "@/components/CreateBountyForm";
import { BountyView } from "@/components/BountyView";
import { Landing } from "@/components/Landing";
import { useRecentBounties } from "@/hooks/useRecentBounties";
import { isContractConfigured, contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { Notice, Input, Button } from "@/components/ui";
import { Logo } from "@/components/Logo";

export default function Home() {
  const [view, setView] = useState<"landing" | "app">("landing");
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const { ids, add } = useRecentBounties();

  useEffect(() => {
    if (selectedId !== null) add(selectedId);
  }, [selectedId, add]);

  const handleCreated = useCallback(
    (id: bigint) => {
      add(id);
      setSelectedId(id);
    },
    [add],
  );

  if (view === "landing") {
    return <Landing onLaunch={() => setView("app")} />;
  }

  return (
    <div className="lg:flex">
      {/* ---------------------------------------------------------- Sidebar */}
      <aside className="border-b border-[var(--border)] bg-[var(--surface)] lg:sticky lg:top-0 lg:h-screen lg:w-[280px] lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col px-4 py-5">
          {/* Brand (returns to landing) */}
          <button
            onClick={() => setView("landing")}
            className="flex items-center gap-2.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-[var(--hover)]"
          >
            <Logo className="h-9 w-9" />
            <div>
              <div className="text-sm font-bold leading-tight tracking-tight">Bounty Judge</div>
              <div className="text-[11px] font-medium leading-tight text-[var(--muted-2)]">
                {ritualChain.name}
              </div>
            </div>
          </button>

          {/* New bounty */}
          <button
            onClick={() => setSelectedId(null)}
            className={`btn-anim mt-6 flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
              selectedId === null
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
                : "border-[var(--border-strong)] bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--hover)]"
            }`}
          >
            <span className="text-base leading-none">+</span> New bounty
          </button>

          {/* Open by id */}
          <OpenById onSelect={setSelectedId} />

          {/* Recent */}
          <div className="mt-6 min-h-0 flex-1 overflow-y-auto">
            <div className="px-1 pb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-2)]">
              Recent bounties
            </div>
            {ids.length === 0 ? (
              <p className="px-1 text-xs font-medium text-[var(--muted-2)]">
                None yet. Create one or open by id.
              </p>
            ) : (
              <div className="space-y-0.5">
                {ids.map((id) => {
                  const active = selectedId?.toString() === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setSelectedId(BigInt(id))}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-semibold transition-colors ${
                        active
                          ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                          : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <span className="font-mono">#{id}</span>
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 border-t border-[var(--border)] pt-3 text-[11px] font-medium text-[var(--muted-2)]">
            {contractAddress ? (
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[var(--muted)]">
                  {shortenAddress(contractAddress, 6)}
                </span>
                <span>Chain {ritualChain.id}</span>
              </div>
            ) : (
              <span>Workshop demo</span>
            )}
          </div>
        </div>
      </aside>

      {/* ------------------------------------------------------------- Main */}
      <main className="min-w-0 flex-1">
        {/* Top bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)]/85 px-5 py-3.5 backdrop-blur-sm sm:px-8">
          <h1 className="text-sm font-bold tracking-tight">
            {selectedId !== null ? (
              <>
                Bounty{" "}
                <span className="font-mono text-[var(--muted)]">#{selectedId.toString()}</span>
              </>
            ) : (
              "Create a bounty"
            )}
          </h1>
          <WalletConnect />
        </div>

        <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
          {!isContractConfigured && (
            <div className="mb-6">
              <Notice tone="amber">
                No contract address configured. Copy{" "}
                <code className="font-mono">.env.example</code> to{" "}
                <code className="font-mono">.env.local</code> and set{" "}
                <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code>.
              </Notice>
            </div>
          )}

          {selectedId !== null ? (
            <BountyView bountyId={selectedId} />
          ) : (
            <CreateScreen onCreated={handleCreated} />
          )}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------- Open by id */

function OpenById({ onSelect }: { onSelect: (id: bigint) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const t = value.trim();
        if (t === "") return;
        try {
          const id = BigInt(t);
          if (id >= 0n) onSelect(id);
          setValue("");
        } catch {
          /* ignore non-numeric */
        }
      }}
      className="mt-2 flex gap-2"
    >
      <Input
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Open by id"
        className="h-9 py-1.5"
      />
      <Button type="submit" variant="secondary" className="h-9 px-3">
        Open
      </Button>
    </form>
  );
}

/* ---------------------------------------------------------- Create screen */

function CreateScreen({ onCreated }: { onCreated: (id: bigint) => void }) {
  return (
    <div className="space-y-7">
      <header>
        <h2 className="max-w-2xl text-[26px] font-extrabold leading-[1.15] tracking-tight sm:text-[32px]">
          Private bounties, judged on-chain by AI.
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] font-medium leading-relaxed text-[var(--muted)]">
          Submissions stay hidden behind a commitment hash until the deadline. After the reveal
          window, one batched AI inference ranks every answer against the rubric, and you finalize
          the winner.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          {["Create", "Commit", "Reveal", "Judge", "Finalize"].map((step, i) => (
            <span key={step} className="flex items-center gap-1.5">
              {i > 0 && (
                <span className="text-[var(--muted-2)]" aria-hidden>
                  →
                </span>
              )}
              <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[var(--muted)]">
                {step}
              </span>
            </span>
          ))}
        </div>
      </header>

      <CreateBountyForm onCreated={onCreated} />

    </div>
  );
}
