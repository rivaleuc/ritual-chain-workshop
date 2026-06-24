"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { keccak256, encodePacked, toHex, type Address } from "viem";
import { useNow } from "@/hooks/useNow";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { canCommit, canReveal, type Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Textarea,
  Button,
  TxStatus,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

type Stored = { answer: string; salt: `0x${string}` };

function storageKey(bountyId: bigint, addr: Address) {
  return `aijudge-commit:${ritualChain.id}:${bountyId}:${addr.toLowerCase()}`;
}

function loadStored(bountyId: bigint, addr: Address): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey(bountyId, addr));
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/** commitment = keccak256(abi.encodePacked(answer, salt, submitter, bountyId)) — matches the contract. */
function computeCommitment(
  answer: string,
  salt: `0x${string}`,
  submitter: Address,
  bountyId: bigint,
) {
  return keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, submitter, bountyId],
    ),
  );
}

function randomSalt(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
}

export function SubmitAnswer({
  bountyId,
  bounty,
  onSubmitted,
}: {
  bountyId: bigint;
  bounty: Bounty;
  onSubmitted: () => void;
}) {
  const { address, isConnected } = useAccount();
  const now = useNow();

  const commitPhase = canCommit(bounty, now);
  const revealPhase = canReveal(bounty, now);
  if (!commitPhase && !revealPhase) return null;

  return commitPhase ? (
    <CommitCard
      bountyId={bountyId}
      address={address}
      isConnected={isConnected}
      onSubmitted={onSubmitted}
    />
  ) : (
    <RevealCard
      bountyId={bountyId}
      address={address}
      isConnected={isConnected}
      onSubmitted={onSubmitted}
    />
  );
}

function CommitCard({
  bountyId,
  address,
  isConnected,
  onSubmitted,
}: {
  bountyId: bigint;
  address?: Address;
  isConnected: boolean;
  onSubmitted: () => void;
}) {
  const [answer, setAnswer] = useState("");
  const tx = useWriteTx(() => {
    setAnswer("");
    onSubmitted();
  });

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !contractAddress || !address) return;
    const salt = randomSalt();
    const commitment = computeCommitment(answer.trim(), salt, address, bountyId);
    // Persist locally so the participant can reveal later. This never leaves the browser.
    localStorage.setItem(
      storageKey(bountyId, address),
      JSON.stringify({ answer: answer.trim(), salt } satisfies Stored),
    );
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "submitCommitment",
        args: [bountyId, commitment],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Commit an answer"
        subtitle="Only a hash goes on-chain now. Your answer stays private until the reveal phase."
      />
      <CardBody>
        <form onSubmit={handleCommit} className="space-y-3">
          <Field label="Your answer (kept in your browser until reveal)">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Write your submission…"
            />
          </Field>
          <Button
            type="submit"
            disabled={!isConnected || !answer.trim() || tx.isBusy}
            className="w-full"
          >
            {tx.isBusy ? "Committing…" : "Commit answer"}
          </Button>
          {!isConnected && (
            <p className="text-xs text-zinc-500">Connect your wallet to commit.</p>
          )}
          <p className="text-xs text-zinc-500">
            The answer and a random salt are saved locally so you can reveal after the
            submission deadline. Do not clear browser storage before revealing.
          </p>
          <TxStatus
            state={tx.state}
            error={tx.error}
            hash={tx.hash}
            explorerBase={explorerBase}
          />
        </form>
      </CardBody>
    </Card>
  );
}

function RevealCard({
  bountyId,
  address,
  isConnected,
  onSubmitted,
}: {
  bountyId: bigint;
  address?: Address;
  isConnected: boolean;
  onSubmitted: () => void;
}) {
  const stored = address ? loadStored(bountyId, address) : null;
  const [answer, setAnswer] = useState(stored?.answer ?? "");
  const [salt, setSalt] = useState<string>(stored?.salt ?? "");
  const tx = useWriteTx(() => {
    if (address) localStorage.removeItem(storageKey(bountyId, address));
    onSubmitted();
  });

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim() || !salt || !contractAddress) return;
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "revealAnswer",
        args: [bountyId, answer.trim(), salt as `0x${string}`],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Reveal your answer"
        subtitle="The contract checks your answer + salt against your commitment."
      />
      <CardBody>
        <form onSubmit={handleReveal} className="space-y-3">
          <Field label="Answer">
            <Textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="Your committed answer…"
            />
          </Field>
          <Field label="Salt (0x… 32 bytes)">
            <input
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              placeholder="0x…"
              className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 outline-none focus:border-zinc-500"
            />
          </Field>
          <Button
            type="submit"
            disabled={!isConnected || !answer.trim() || !salt || tx.isBusy}
            className="w-full"
          >
            {tx.isBusy ? "Revealing…" : "Reveal answer"}
          </Button>
          {!stored && (
            <p className="text-xs text-amber-500">
              No saved answer found in this browser. Paste the exact answer and salt you
              committed with.
            </p>
          )}
          <TxStatus
            state={tx.state}
            error={tx.error}
            hash={tx.hash}
            explorerBase={explorerBase}
          />
        </form>
      </CardBody>
    </Card>
  );
}
