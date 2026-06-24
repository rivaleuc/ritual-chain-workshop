# Advanced Track — Ritual-Native Hidden Submissions

This track keeps answers **encrypted end to end**: unlike commit-reveal, no plaintext answer is
ever published on-chain, not even after judging. It is **implemented** as a separate contract,
`hardhat/contracts/AIJudgeTEE.sol`, plus the off-chain TEE flow described here.

## Live deployment (chain 1979)

`AIJudgeTEE` is deployed and exercised end-to-end live on Ritual at
`0x8fb50452524fda4284b17b793d519a90fdd72b5d`: deploy → `submitEncrypted` (only a commitment + a
`hf:` ciphertext ref on-chain, no plaintext) → `judgeAll` (one batched LLM call in the TEE;
GLM-4.7-FP8 returned `{"winnerIndex": 0, "summary": "ok"}`; the contract stored the review plus the
`revealedAnswersRef` + `revealedAnswersHash` bundle commitment) → `finalizeWinner`. Reproduce with
`hardhat/scripts/deploy-tee-demo.mjs` (executor `0xB42e…c91B`).

## Flow

```
participant                DA (HF / IPFS / GCS)          AIJudgeTEE (chain)         Ritual TEE executor
   |  encrypt(answer) to bounty DKMS key   |                    |                          |
   |------------ ciphertext --------------->|                    |                          |
   |  submitEncrypted(bountyId, commitment, ciphertextRef) ----->| store ref + hash         |
   |                                        |                    | (no plaintext)           |
  --- submission deadline passes ---        |                    |                          |
   owner: judgeAll(bountyId, llmInput, bundleRef, bundleHash) -->| LLM precompile (0x0802) ->| fetch every ciphertext
   |                                        |<--- DKMS-decrypt inside enclave --------------| (private key never leaves TEE)
   |                                        |     build ONE batch prompt -> LLM             |
   |                                        |     publish revealed bundle ----------------->|
   |                                        |    review + bundleRef + bundleHash --------->| onResult
   owner: finalizeWinner(bountyId, idx) ---------------------->| pay winner (human ratifies)|
```

## Required explanations (per the homework)

**Where do plaintext answers exist, and who can read them?**
Plaintext exists in exactly two places: (1) on the participant's own machine before they encrypt,
and (2) transiently inside the Ritual TEE enclave during the `judgeAll` inference. Nobody else,
not other participants, not the bounty owner, not an on-chain observer, can read it. At rest in the
DA provider it is ciphertext; on-chain it is only a reference and a hash.

**What is stored on-chain vs off-chain?**
- **On-chain (`AIJudgeTEE`):** bounty metadata (title, rubric, reward, deadline), and per submission
  a `commitment` hash + a `StorageRef` (platform, path, keyRef) pointing at the ciphertext. After
  judging: the AI review, plus `revealedAnswersRef` and `revealedAnswersHash`. No answer text.
- **Off-chain (DA: HF / IPFS / GCS):** the encrypted answers, and the published revealed-answers
  bundle. Large content lives here; the chain only commits to it with a 32-byte hash.

**How does the LLM receive all submissions for batch judging?**
`judgeAll` makes a **single** call to the LLM inference precompile (`0x0802`). The executor, inside
the TEE, reads every ciphertext referenced on-chain, DKMS-decrypts them with the bounty key (which
exists only in the enclave), assembles **one** prompt containing the rubric and all answers, and
runs **one** inference that returns a ranked review. There is no per-answer LLM call and no loop of
inference calls in Solidity.

**How does the final reveal happen, and how does the contract commit to it?**
After judging, the TEE writes a single revealed-answers bundle to DA and returns its location and
hash. `judgeAll` stores `revealedAnswersRef` (where the bundle is) and `revealedAnswersHash`
(`keccak256` of the bundle bytes). Anyone can fetch the bundle and re-hash it to confirm it matches
what was judged. This is how the contract commits to the final revealed set without holding it.

**Why not store plaintext on-chain?**
Ten answers of up to a few KB each would be expensive and would also defeat the privacy goal. We
store one ciphertext reference per submission and one 32-byte hash for the final bundle instead.

## Ritual focus (beyond "just call an LLM")

- **Encrypted secrets / private inputs:** answers are ECIES-encrypted to a DKMS-derived bounty key;
  storage credentials live in the executor's encrypted secrets, never in plaintext on-chain. The
  `keyRef` can carry the `dkms_encrypted:` prefix so the executor DKMS-decrypts after download.
- **TEE-backed execution:** the judging sees private inputs while keeping them hidden from the
  public chain. Attestation is the trust anchor that the decryption happened only inside the enclave.
- **Batch judging:** one inference over the whole set (see `judgeAll`), not one call per answer.
- **Human-in-the-loop:** the AI recommends a ranking; the owner calls `finalizeWinner` to pay. The
  contract never auto-pays from raw AI output.

## Contract surface (`AIJudgeTEE.sol`)

| Function | Purpose |
|---|---|
| `createBounty(title, rubric, submissionDeadline)` | escrow reward, open submissions |
| `submitEncrypted(bountyId, commitment, ciphertextRef)` | store hash + ciphertext ref, no plaintext |
| `judgeAll(bountyId, llmInput, revealedAnswersRef, revealedAnswersHash)` | batch TEE judging, commit to bundle |
| `finalizeWinner(bountyId, winnerIndex)` | owner ratifies + pays |
| `getBounty` / `getSubmission` | views; `getSubmission` returns the ciphertext ref, never plaintext |

## Example final output shape

```json
{
  "winnerIndex": 2,
  "ranking": [{ "index": 2, "score": 94, "reason": "Best satisfies the rubric." }],
  "revealedAnswersRef": "ipfs://… or storage-ref://…",
  "revealedAnswersHash": "0x…",
  "summary": "Submission 2 is the strongest answer."
}
```

## Private judging — keeping answers out of calldata

The first live demo exposed a real gap: building the judge prompt with answers inline put the
answer plaintext into the `judgeAll` calldata (public on-chain). The fix keeps answers off-chain:

- **On-chain calldata** (`judgeAll` → LLM precompile) carries only the rubric (public), a generic
  "judge the submissions in the attached history" instruction, the `convoHistory` StorageRef, and
  the DA credential **ECIES-encrypted to the executor's public key** in `encryptedSecrets`. No answer.
- **Off-chain (DA)**: the answers live as a JSONL bundle in hf/gcs/pinata. The executor decrypts the
  credential inside the TEE, loads the bundle as conversation context, and judges all answers in one
  batched inference.

`hardhat/scripts/encode-private-judge.mjs` builds this request and **self-verifies** that the encoded
calldata contains zero answer plaintext (the inline version leaks it; the private version does not —
run `node scripts/encode-private-judge.mjs`).

Honest limitation: Ritual's LLM `convoHistory` is stored as **plaintext JSONL** off-chain (only the
access credential is encrypted, to the enclave), so this gives *off-chain + TEE-gated access*, not
*encryption at rest*. For answers that must stay ciphertext even at rest through judging, the FHE
precompile (`0x0807`) is the path — a larger build noted as future work.

## Test plan (advanced track)

`hardhat/test/AIJudgeTEE.ts` (16 cases, all passing with `npx hardhat test`). The LLM precompile
(`0x0802`) is mocked locally via `hardhat_setCode` (`contracts/test/MockLLM.sol`) so the batch-judge
path runs without a live executor. Cases:

- **Encrypted submit:** stores only a commitment + ciphertext `StorageRef`, never plaintext
  (privacy invariant — `getSubmission` exposes no answer field); rejects empty commitment; rejects
  empty ciphertext ref; rejects a second submission per address; rejects submitting after the deadline.
- **Batch judging (TEE):** judges all submissions in **one** call and records the AI review plus the
  `revealedAnswersRef` + `revealedAnswersHash` bundle commitment; rejects judging before the deadline;
  rejects judging with no submissions; rejects a non-owner; bubbles up an LLM error envelope
  (`hasError=true`); rejects judging twice.
- **Finalize (human-in-the-loop):** rejects finalize before judging; rejects an out-of-range winner;
  rejects a non-owner; pays the winning submitter and closes the bounty; rejects finalizing twice.

## Commit-reveal vs Ritual-native (summary)

| | Commit-reveal (Required) | Ritual-native TEE (Advanced) |
|---|---|---|
| Hidden during submission | Yes (hash) | Yes (ciphertext) |
| Hidden during judging | No (revealed first) | Yes (decrypted only in enclave) |
| Public after judging | Yes (on-chain) | Optional (bundle ref + hash) |
| Chain | Any EVM | Ritual (TEE + DKMS + LLM) |
| Best for | Open contests | Answers with lasting value |
