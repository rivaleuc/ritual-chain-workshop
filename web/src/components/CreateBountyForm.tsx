"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardBody,
  Field,
  Input,
  Textarea,
  Button,
  TxStatus,
  Notice,
  Badge,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

/** datetime-local value = now + N minutes, in the input's expected format. */
function defaultDeadline(minutesFromNow: number): string {
  const d = new Date(Date.now() + minutesFromNow * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function relFromNow(value: string): string {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "—";
  const mins = Math.round((t - Date.now()) / 60000);
  if (mins < 1) return "past";
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `in ${hrs} h`;
  return `in ${Math.round(hrs / 24)} d`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-2)]">
      {children}
    </div>
  );
}

export function CreateBountyForm({ onCreated }: { onCreated?: (bountyId: bigint) => void }) {
  const { isConnected } = useAccount();
  const [title, setTitle] = useState("");
  const [rubric, setRubric] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState(defaultDeadline(60));
  const [revealDeadline, setRevealDeadline] = useState(defaultDeadline(120));
  const [reward, setReward] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);

  const tx = useWriteTx((receipt) => {
    try {
      const logs = parseEventLogs({
        abi: aiJudgeAbi,
        eventName: "BountyCreated",
        logs: receipt.logs,
      });
      const id = logs[0]?.args?.bountyId;
      if (id !== undefined) {
        setCreatedId(id);
        onCreated?.(id);
      }
    } catch {
      /* couldn't decode — not fatal */
    }
  });

  const validation = useMemo(() => {
    if (!title.trim()) return "Title is required.";
    if (!rubric.trim()) return "Rubric is required.";
    if (!submissionDeadline) return "Pick a submission deadline.";
    if (!revealDeadline) return "Pick a reveal deadline.";
    const sub = new Date(submissionDeadline).getTime();
    const rev = new Date(revealDeadline).getTime();
    if (!Number.isFinite(sub) || !Number.isFinite(rev)) return "Invalid deadline.";
    if (rev <= sub) return "Reveal deadline must be after the submission deadline.";
    if (reward !== "") {
      try {
        parseEther(reward);
      } catch {
        return "Reward must be a valid number.";
      }
    }
    return null;
  }, [title, rubric, submissionDeadline, revealDeadline, reward]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation || !contractAddress) return;

    const subMs = new Date(submissionDeadline).getTime();
    const revMs = new Date(revealDeadline).getTime();
    if (subMs <= Date.now()) {
      window.alert("Submission deadline must be in the future.");
      return;
    }

    // Ritual block timestamps are in milliseconds.
    const subTs = BigInt(subMs);
    const revTs = BigInt(revMs);
    const value = reward.trim() === "" ? 0n : parseEther(reward.trim());
    setCreatedId(null);

    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "createBounty",
        args: [title.trim(), rubric.trim(), subTs, revTs],
        value,
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      {/* ---------------------------------------------------- Form (left) */}
      <div className="lg:col-span-3">
        <Card>
          <CardBody className="space-y-6">
            {!isContractConfigured && (
              <Notice tone="amber">
                Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in your{" "}
                <code className="font-mono">.env.local</code> to enable transactions.
              </Notice>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Details */}
              <div className="space-y-3">
                <SectionLabel>Details</SectionLabel>
                <Field label="Title">
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Best gas-optimization writeup"
                    maxLength={200}
                  />
                </Field>
                <Field
                  label="Rubric"
                  hint="How submissions are scored. The AI judges only against this."
                >
                  <Textarea
                    value={rubric}
                    onChange={(e) => setRubric(e.target.value)}
                    rows={4}
                    placeholder="Correctness 50%, clarity 30%, novelty 20%…"
                  />
                </Field>
              </div>

              {/* Windows */}
              <div className="space-y-3 border-t border-[var(--border)] pt-5">
                <SectionLabel>Commit &amp; reveal windows</SectionLabel>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Submission deadline" hint="Commit phase ends here.">
                    <Input
                      type="datetime-local"
                      value={submissionDeadline}
                      onChange={(e) => setSubmissionDeadline(e.target.value)}
                    />
                  </Field>
                  <Field label="Reveal deadline" hint="Reveal ends here; judging follows.">
                    <Input
                      type="datetime-local"
                      value={revealDeadline}
                      onChange={(e) => setRevealDeadline(e.target.value)}
                    />
                  </Field>
                </div>
              </div>

              {/* Reward */}
              <div className="space-y-3 border-t border-[var(--border)] pt-5">
                <SectionLabel>Reward</SectionLabel>
                <Field label="Amount" hint="Escrowed in the contract on create.">
                  <div className="relative">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={reward}
                      onChange={(e) => setReward(e.target.value)}
                      placeholder="1.0"
                      className="pr-20"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--muted-2)]">
                      RITUAL
                    </span>
                  </div>
                </Field>
              </div>

              {validation && (title || rubric || reward) ? (
                <p className="text-xs font-semibold text-amber-600">{validation}</p>
              ) : null}

              <Button
                type="submit"
                disabled={!isConnected || !isContractConfigured || !!validation || tx.isBusy}
                className="w-full"
              >
                {tx.isBusy ? "Creating…" : "Create bounty"}
              </Button>

              {!isConnected && (
                <p className="text-center text-xs font-medium text-[var(--muted-2)]">
                  Connect your wallet to create a bounty.
                </p>
              )}

              <TxStatus
                state={tx.state}
                error={tx.error}
                hash={tx.hash}
                explorerBase={explorerBase}
              />

              {createdId !== null && (
                <Notice tone="green">
                  Bounty created with id{" "}
                  <span className="font-mono font-semibold">#{createdId.toString()}</span>. Opening
                  it now.
                </Notice>
              )}
            </form>
          </CardBody>
        </Card>
      </div>

      {/* ------------------------------------------------- Preview (right) */}
      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-24 space-y-3">
          <Card>
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionLabel>Preview</SectionLabel>
                <Badge tone="indigo">Draft</Badge>
              </div>

              <div>
                <div className="text-base font-bold tracking-tight">
                  {title.trim() || (
                    <span className="text-[var(--muted-2)]">Untitled bounty</span>
                  )}
                </div>
                <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-[var(--muted)]">
                  {rubric.trim() || "Your rubric will appear here."}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <PreviewStat label="Reward" value={reward.trim() ? `${reward} RITUAL` : "—"} />
                <PreviewStat label="Status" value="Commit phase" />
                <PreviewStat label="Commit until" value={relFromNow(submissionDeadline)} />
                <PreviewStat label="Reveal until" value={relFromNow(revealDeadline)} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SectionLabel>How judging works</SectionLabel>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[var(--muted)]">
                After the reveal window, one batched AI inference ranks every revealed answer
                against your rubric. The review is advisory, you finalize the winner.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted-2)]">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">{value}</div>
    </div>
  );
}
