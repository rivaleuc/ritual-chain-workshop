import type { Address } from "viem";

/** Parsed shape of the `getBounty` tuple return value. */
export type Bounty = {
  owner: Address;
  title: string;
  rubric: string;
  reward: bigint;
  submissionDeadline: bigint;
  revealDeadline: bigint;
  judged: boolean;
  finalized: boolean;
  submissionCount: bigint;
  winnerIndex: bigint;
  aiReview: `0x${string}`;
};

/** getBounty returns a positional tuple — map it to a named object. */
export function parseBounty(
  raw: readonly [
    Address,
    string,
    string,
    bigint,
    bigint,
    bigint,
    boolean,
    boolean,
    bigint,
    bigint,
    `0x${string}`,
  ],
): Bounty {
  const [
    owner,
    title,
    rubric,
    reward,
    submissionDeadline,
    revealDeadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  ] = raw;
  return {
    owner,
    title,
    rubric,
    reward,
    submissionDeadline,
    revealDeadline,
    judged,
    finalized,
    submissionCount,
    winnerIndex,
    aiReview,
  };
}

export type BountyStatus =
  | "commit"
  | "reveal"
  | "ready"
  | "judged"
  | "finalized";

// Ritual block timestamps are in milliseconds, so compare against Date.now() (ms).
export function getBountyStatus(b: Bounty, nowMs = Date.now()): BountyStatus {
  if (b.finalized) return "finalized";
  if (b.judged) return "judged";
  if (nowMs < Number(b.submissionDeadline)) return "commit";
  if (nowMs < Number(b.revealDeadline)) return "reveal";
  return "ready";
}

export const STATUS_META: Record<
  BountyStatus,
  { label: string; tone: "green" | "amber" | "indigo" | "zinc" }
> = {
  commit: { label: "Commit phase", tone: "green" },
  reveal: { label: "Reveal phase", tone: "amber" },
  ready: { label: "Ready for judging", tone: "amber" },
  judged: { label: "Judged", tone: "indigo" },
  finalized: { label: "Finalized", tone: "zinc" },
};

/** Commit phase: participants can submit commitment hashes. (ms timestamps) */
export function canCommit(b: Bounty, nowMs = Date.now()): boolean {
  return !b.judged && !b.finalized && Number(b.submissionDeadline) > nowMs;
}

/** Reveal phase: participants reveal their answer + salt. (ms timestamps) */
export function canReveal(b: Bounty, nowMs = Date.now()): boolean {
  return (
    !b.judged &&
    !b.finalized &&
    Number(b.submissionDeadline) <= nowMs &&
    Number(b.revealDeadline) > nowMs
  );
}
