# Privacy-Preserving AI Bounty Judge — Submission

Extends the workshop app so submissions stay hidden until judging. The public-answer flaw is
replaced with a **commit-reveal** flow (Required Track) and a **Ritual-native TEE** design that is
also implemented (Advanced Track).

## New bounty lifecycle

```
createBounty ──► COMMIT (hash only) ──► REVEAL (answer+salt) ──► JUDGE (batch LLM) ──► FINALIZE (pay)
```

1. **Create** — `createBounty(title, rubric, submissionDeadline, revealDeadline)` escrows the reward.
2. **Commit** (before `submissionDeadline`) — `submitCommitment(bountyId, commitment)`,
   `commitment = keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))`. Only the hash is
   on-chain; the answer stays private.
3. **Reveal** (between `submissionDeadline` and `revealDeadline`) — `revealAnswer(bountyId, answer, salt)`;
   the contract recomputes the hash and requires it to match. Only valid reveals are eligible.
4. **Judge** (after `revealDeadline`) — `judgeAll(bountyId, llmInput)`; one batch LLM inference over
   the revealed answers (never one call per answer).
5. **Finalize** — `finalizeWinner(bountyId, winnerIndex)`; owner ratifies (human-in-the-loop) and the
   reward is paid.

## Deliverables (where to find each)

| Deliverable | File |
|---|---|
| Updated Solidity contract (commit-reveal) | [`hardhat/contracts/AIJudge.sol`](hardhat/contracts/AIJudge.sol) |
| Advanced track contract (encrypted, TEE) | [`hardhat/contracts/AIJudgeTEE.sol`](hardhat/contracts/AIJudgeTEE.sol) |
| README explaining the lifecycle | this file + [`SUBMISSION.md`](SUBMISSION.md) |
| Test plan for reveal cases (11 cases) | [`hardhat/test/AIJudge.ts`](hardhat/test/AIJudge.ts) |
| Architecture note (commit-reveal vs Ritual-native) | [`SUBMISSION.md`](SUBMISSION.md) + [`ADVANCED.md`](ADVANCED.md) |
| Reflection answer (5-8 sentences) | [`SUBMISSION.md`](SUBMISSION.md) |

## Run it

```bash
# Contract: compile + tests (11 reveal cases)
cd hardhat && pnpm install && npx hardhat test

# Frontend
cd web && pnpm install && pnpm dev   # set NEXT_PUBLIC_CONTRACT_ADDRESS in web/.env.local
```

The commit-reveal contract is deployed and verified live on Ritual testnet (chain 1979):
`AIJudge` at `0x09d9973048fdc9b8d9dd04575d25093df798b121` (commit → answer hidden, reveal →
answer revealed, confirmed on-chain).

> Note: Ritual `block.timestamp` is in **milliseconds**, so deadlines (contract and frontend) use
> millisecond timestamps, not seconds.

---

/hardhat — the smart contract · /web — the frontend
