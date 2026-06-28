"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useChainId,
  useSwitchChain,
} from "wagmi";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { Button, Badge } from "@/components/ui";

export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);

  const wrongChain = isConnected && chainId !== ritualChain.id;

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        {wrongChain ? (
          <Button
            variant="secondary"
            onClick={() => switchChain({ chainId: ritualChain.id })}
          >
            Switch to {ritualChain.name}
          </Button>
        ) : (
          <Badge tone="green">{ritualChain.name}</Badge>
        )}
        <Button variant="secondary" onClick={() => disconnect()}>
          {shortenAddress(address)}
        </Button>
      </div>
    );
  }

  // Dedupe connectors by name (injected + metaMask can overlap).
  const seen = new Set<string>();
  const list = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className="relative">
      <Button onClick={() => setOpen((v) => !v)} disabled={isPending}>
        {isPending ? "Connecting…" : "Connect Wallet"}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-md border border-[var(--border-strong)] bg-[var(--surface)] shadow-lg shadow-black/40">
          {list.length === 0 && (
            <div className="px-3 py-2 text-xs font-medium text-[var(--muted-2)]">
              No wallet connectors found.
            </div>
          )}
          {list.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm font-medium text-[var(--foreground)] hover:bg-[var(--hover)]"
            >
              {connector.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
