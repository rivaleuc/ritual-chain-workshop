# Privacy-Preserving AI Bounty Judge — Submission

Track: **Required (Commit-Reveal)**, plus an **architecture design for the Advanced (Ritual-native)** track.

## The problem we fixed

The starter `AIJudge` stored every answer in plaintext via `submitAnswer`. Anyone could read the
submissions list, copy the strongest answer, and submit an improved version before the deadline.
The contract now uses a commit-reveal flow so no answer content is visible until the submission
phase is over.

## Lifecycle

```
createBounty ──► COMMIT phase ──► REVEAL phase ──► JUDGE ──► FINALIZE
                 (hash only)      (answer+salt)     (LLM)     (pay winner)
```

1. **Create** — `createBounty(title, rubric, submissionDeadline, revealDeadline)` escrows the
   reward (`msg.value`) and sets the two deadlines (`submission < reveal`).
2. **Commit** (`now < submissionDeadline`) — `submitCommitment(bountyId, commitment)` where
   `commitment = keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))`. Only the hash is
   on-chain. One commitment per address.
3. **Reveal** (`submissionDeadline <= now < revealDeadline`) — `revealAnswer(bountyId, answer, salt)`.
   The contract recomputes the hash and requires it to equal the stored commitment. Binding the
   hash to `msg.sender` and `bountyId` stops anyone replaying another person's reveal or reusing a
   commitment across bounties. The plaintext is stored only now.
4. **Judge** (`now >= revealDeadline`) — `judgeAll(bountyId, llmInput)` (owner only). Runs the LLM
   inference precompile once over the revealed answers and stores the AI review. Unrevealed
   submissions carry empty answers and are not eligible.
5. **Finalize** — `finalizeWinner(bountyId, winnerIndex)` (owner only). Pays the reward; the winner
   must be a revealed submission.

## Function reference

| Function | Phase | Notes |
|---|---|---|
| `createBounty(title, rubric, submissionDeadline, revealDeadline)` payable | setup | escrows reward |
| `submitCommitment(uint256 bountyId, bytes32 commitment)` | commit | one per address, hash only |
| `revealAnswer(uint256 bountyId, string answer, bytes32 salt)` | reveal | verifies the commitment |
| `judgeAll(uint256 bountyId, bytes llmInput)` | judge | owner, batch LLM, after reveal closes |
| `finalizeWinner(uint256 bountyId, uint256 winnerIndex)` | finalize | owner, pays revealed winner |
| `getBounty / getSubmission` | view | `answer` is empty until revealed |

## Test plan (reveal cases)

`hardhat/test/AIJudge.ts` (11 cases, all passing with `npx hardhat test`):

- Answer stays hidden during commit (`getSubmission.answer == ""`, `revealed == false`).
- Valid reveal stores the answer and flips `revealed`.
- Wrong answer rejected (`commitment mismatch`).
- Wrong salt rejected (`commitment mismatch`).
- Reveal during commit phase rejected (`reveal not open`).
- Reveal after `revealDeadline` rejected (`reveal closed`).
- Reveal from a non-committer rejected (`no commitment`).
- Double reveal rejected (`already revealed`).
- Commit after `submissionDeadline` rejected (`submissions closed`).
- Second commit from same address rejected (`already committed`).
- `judgeAll` before reveal closes rejected (`reveal not finished`).

(The live LLM step in `judgeAll` runs against Ritual's `0x0802` precompile on chain 1979; locally
we test every guard up to that call.)

The advanced track has its own suite, `hardhat/test/AIJudgeTEE.ts` (16 cases), covering encrypted
submit, one-call batch judging, and finalize — the LLM precompile is mocked locally via
`hardhat_setCode` so the judge path runs end-to-end. Full suite: **27 passing** (`npx hardhat test`).
The full commit→reveal→judge→finalize loop is also verified live on Ritual (bounty 2): GLM-4.7-FP8
returned `{"winnerIndex": 0, "summary": "ok"}` and the winner was finalized on-chain.

## Architecture note

### Required track (commit-reveal) — what is public vs hidden

- **On-chain, always public:** bounty rules (title, rubric, deadlines, reward), the list of
  participant addresses, and each `commitment` hash. The hash leaks nothing about the answer.
- **Hidden until reveal:** the answer text and salt, held by the participant off-chain. Plaintext
  first touches the chain only in `revealAnswer`, after the commit window closes.
- **After reveal:** answers are public on-chain, which is intentional. It makes judging auditable
  and lets anyone re-check the AI review and the payout.
- **Trust model:** the chain enforces timing and the hash binding; it does not need to keep secrets.
  The only thing a participant must protect is their own answer+salt until reveal.

### Advanced track (Ritual-native, TEE) — design

Goal: answers stay encrypted (not just hashed) and are never public, even after judging.

- **Submit:** the participant ECIES-encrypts their answer to a per-bounty DA key derived via DKMS
  (precompile `0x081B`), uploads the ciphertext to a DA provider (HF/GCS/Pinata), and stores
  on-chain only a `StorageRef` plus a commitment hash. Plaintext never leaves the participant
  except as ciphertext.
- **Storage split:** on-chain holds commitments and ciphertext references; off-chain (DA) holds the
  encrypted answers. Neither location exposes plaintext.
- **Judge (batch):** `judgeAll` invokes the Sovereign Agent / LLM precompile inside the TEE. The
  enclave reads every ciphertext, decrypts them with the DKMS-derived private key (which exists only
  inside the TEE), assembles a single batch prompt of all answers against the rubric, and returns
  one ranked review. This is one inference over the whole set, not one call per answer.
- **Where plaintext exists:** only transiently inside the TEE during the judging call. It is never
  written back in plaintext; the stored output is the AI review (scores/ranking), and raw answers
  stay encrypted at rest.
- **Final reveal (no large plaintext on-chain):** after judging, the TEE writes a single revealed
  answers bundle to DA and the contract stores only `revealedAnswersRef` (where the bundle lives)
  and `revealedAnswersHash` (`keccak256` of the bundle). Anyone can fetch the bundle and re-hash it
  to verify it matches what was judged. We never put 10 long answers in contract storage; we commit
  to them with one 32-byte hash.
- **What the contract verifies:** on `judgeAll` the contract records `revealedAnswersHash` and the
  AI review; on `finalizeWinner` the owner ratifies `winnerIndex`. The chain commits to the bundle
  (hash) and the outcome; it never holds the plaintext.

**Private submission flow:**

```
participant            DA (HF/IPFS)            chain                 TEE executor
    |  encrypt(answer)      |                    |                        |
    |---- ciphertext ------>|                    |                        |
    |---- commitment + storageRef -------------->| submitEncrypted        |
    |                       |                    |                        |
   (judge)                  |   judgeAll(bountyId) ------------------------>| read ciphertexts
    |                       |<------- decrypt inside enclave --------------| (DKMS priv key)
    |                       |                    |   batch prompt -> LLM   |
    |                       |   write bundle ---->|                        |
    |                       |   ref + hash + review --------------------->| onResult
```

**Example final output shape:**

```json
{
  "winnerIndex": 2,
  "ranking": [{ "index": 2, "score": 94, "reason": "Best satisfies the rubric." }],
  "revealedAnswersRef": "ipfs://… or storage-ref://…",
  "revealedAnswersHash": "0x…",
  "summary": "Submission 2 is the strongest answer."
}
```

### Commit-reveal vs Ritual-native — comparison

| | Commit-reveal (Required) | Ritual-native TEE (Advanced) |
|---|---|---|
| Hidden during submission | Yes (hash only) | Yes (ciphertext) |
| Hidden during judging | No (revealed first, public) | Yes (decrypted only in enclave) |
| Public after judging | Yes (on-chain plaintext) | Optional (publish bundle ref + hash) |
| Chain dependency | Any EVM chain | Ritual (TEE + DKMS + LLM precompile) |
| Trust model | Chain enforces timing + hash | Plus trust in TEE attestation |
| Best for | Open contests, simple + portable | Answers with lasting value (exploits, IP) |
| Cost | Plaintext on-chain after reveal | One 32-byte hash + off-chain bundle |

## Reflection

> What should be public, what should stay hidden, and what should be decided by AI versus by a human?

In a bounty system the rules should be fully public: the prompt, the rubric, the deadlines, the
reward, and the participants with their commitment hashes, so the process is verifiable. What must
stay hidden is the content of each answer until everyone has committed, otherwise late entrants
copy and improve on early ones, which is exactly the flaw commit-reveal closes. After the reveal
deadline the answers can become public, which is healthy: it makes the outcome auditable and lets
the community re-check the result. AI is well suited to the first pass, reading every revealed
answer against the rubric at once and producing consistent, explainable scores at scale with less
individual bias. A human should keep final authority, because rubrics are interpretive, ties and
edge cases need judgment, and accountability for paying real value should rest with a person rather
than an opaque model. The clean split is: the chain enforces fairness and timing, the AI proposes a
ranked review, and a human ratifies the winner. For that to be trustworthy the AI's input and output
should themselves be verifiable, which is why running the judging in a TEE and storing the review
on-chain matters: "the AI decided" becomes auditable instead of a black box.
