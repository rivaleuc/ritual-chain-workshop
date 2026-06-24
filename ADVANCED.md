# Advanced Track — Ritual-Native Hidden Submissions

This track keeps answers **encrypted end to end**: unlike commit-reveal, no plaintext answer is
ever published on-chain, not even after judging. It is **implemented** as a separate contract,
`hardhat/contracts/AIJudgeTEE.sol`, plus the off-chain TEE flow described here.

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

## Commit-reveal vs Ritual-native (summary)

| | Commit-reveal (Required) | Ritual-native TEE (Advanced) |
|---|---|---|
| Hidden during submission | Yes (hash) | Yes (ciphertext) |
| Hidden during judging | No (revealed first) | Yes (decrypted only in enclave) |
| Public after judging | Yes (on-chain) | Optional (bundle ref + hash) |
| Chain | Any EVM | Ritual (TEE + DKMS + LLM) |
| Best for | Open contests | Answers with lasting value |
