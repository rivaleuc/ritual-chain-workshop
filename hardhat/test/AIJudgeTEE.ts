import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, keccak256, encodePacked, toHex, getAddress, hexToString } from "viem";

const { viem } = await network.connect();

// commitment = keccak256(abi.encodePacked(answer, salt, submitter, bountyId))
// (binds the ciphertext to its author + bounty; verified off-chain / in the TEE).
function commitmentOf(answer: string, salt: `0x${string}`, submitter: `0x${string}`, bountyId: bigint) {
  return keccak256(
    encodePacked(["string", "bytes32", "address", "uint256"], [answer, salt, getAddress(submitter), bountyId]),
  );
}

const LLM_PRECOMPILE = "0x0000000000000000000000000000000000000802" as const;
const SALT_A = toHex("salt-tee-alice", { size: 32 });
const SALT_B = toHex("salt-tee-bob", { size: 32 });
const ref = (path: string) => ({ platform: "hf", path, keyRef: "dkms_encrypted:HF_TOKEN" });
const BUNDLE_REF = "hf://rivale/bounty/revealed.jsonl";
const BUNDLE_HASH = keccak256(toHex("revealed-bundle"));

describe("AIJudgeTEE — Ritual-native hidden submissions (Advanced Track)", () => {
  let judge: any;
  let publicClient: any;
  let testClient: any;
  let owner: any, alice: any, bob: any;
  let bountyId: bigint;
  let subDeadline: bigint;

  before(async () => {
    publicClient = await viem.getPublicClient();
    testClient = await viem.getTestClient();
    [owner, alice, bob] = await viem.getWalletClients();
  });

  beforeEach(async () => {
    judge = await viem.deployContract("AIJudgeTEE");
    const now = (await publicClient.getBlock()).timestamp;
    subDeadline = now + 1000n;
    await judge.write.createBounty(["Best exploit writeup", "Most severe, clearly explained", subDeadline], {
      value: parseEther("1"),
    });
    bountyId = 1n;
  });

  async function warpTo(ts: bigint) {
    await testClient.setNextBlockTimestamp({ timestamp: ts });
    await testClient.mine({ blocks: 1 });
  }

  // Install a mock at the LLM precompile address so judgeAll's async call resolves locally.
  async function installLLM(kind: "ok" | "err") {
    const mock = await viem.deployContract(kind === "ok" ? "MockLLMOk" : "MockLLMErr");
    const code = await publicClient.getCode({ address: mock.address });
    await testClient.setCode({ address: LLM_PRECOMPILE, bytecode: code! });
  }

  async function submit(account: any, answer: string, salt: `0x${string}`, path: string) {
    const c = commitmentOf(answer, salt, account.account.address, bountyId);
    await judge.write.submitEncrypted([bountyId, c, ref(path)], { account: account.account });
    return c;
  }

  // ---- submit (encrypted) phase --------------------------------------------
  it("stores only a commitment + ciphertext ref — never plaintext", async () => {
    const c = await submit(alice, "secret exploit", SALT_A, "alice/sub.enc");
    const sub = await judge.read.getSubmission([bountyId, 0n]); // [submitter, commitment, ciphertextRef]
    assert.equal(getAddress(sub[0]), getAddress(alice.account.address));
    assert.equal(sub[1], c);
    assert.equal(sub[2].platform, "hf");
    assert.equal(sub[2].path, "alice/sub.enc");
    // privacy invariant: the on-chain submission exposes no plaintext answer field at all.
    assert.equal(Object.keys(sub).length, 3);
  });

  it("rejects an empty commitment", async () => {
    await assert.rejects(
      judge.write.submitEncrypted([bountyId, toHex("", { size: 32 }), ref("x.enc")], { account: alice.account }),
      /empty commitment/,
    );
  });

  it("rejects an empty ciphertext reference", async () => {
    const c = commitmentOf("a", SALT_A, alice.account.address, bountyId);
    await assert.rejects(
      judge.write.submitEncrypted([bountyId, c, ref("")], { account: alice.account }),
      /empty ciphertext ref/,
    );
  });

  it("rejects a second submission from the same address", async () => {
    await submit(alice, "first", SALT_A, "a1.enc");
    await assert.rejects(submit(alice, "second", SALT_A, "a2.enc"), /already submitted/);
  });

  it("rejects a submission after the deadline", async () => {
    await warpTo(subDeadline + 1n);
    await assert.rejects(submit(bob, "late", SALT_B, "b.enc"), /submissions closed/);
  });

  // ---- judge (batch, in TEE) phase -----------------------------------------
  it("judges all submissions in one batch call and records review + bundle commitment", async () => {
    await submit(alice, "alice exploit", SALT_A, "alice.enc");
    await submit(bob, "bob exploit", SALT_B, "bob.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("ok");

    await judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account });

    const b = await judge.read.getBounty([bountyId]);
    // [owner,title,rubric,reward,deadline,judged,finalized,count,winnerIndex,aiReview,revealedAnswersRef,revealedAnswersHash]
    assert.equal(b[5], true); // judged
    assert.equal(hexToString(b[9]), '{"winnerIndex": 1, "summary": "ok"}');
    assert.equal(b[10], BUNDLE_REF);
    assert.equal(b[11], BUNDLE_HASH);
  });

  it("rejects judging before the submission deadline", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await installLLM("ok");
    await assert.rejects(
      judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account }),
      /submissions still open/,
    );
  });

  it("rejects judging with no submissions", async () => {
    await warpTo(subDeadline + 1n);
    await installLLM("ok");
    await assert.rejects(
      judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account }),
      /no submissions/,
    );
  });

  it("rejects judging by a non-owner", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("ok");
    await assert.rejects(
      judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: alice.account }),
      /not bounty owner/,
    );
  });

  it("bubbles up an LLM error envelope (hasError=true)", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("err");
    await assert.rejects(
      judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account }),
      /model failed/,
    );
  });

  it("rejects judging twice", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("ok");
    await judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account });
    await assert.rejects(
      judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account }),
      /already judged/,
    );
  });

  // ---- finalize (human-in-the-loop) phase ----------------------------------
  it("rejects finalize before judging", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await warpTo(subDeadline + 1n);
    await assert.rejects(judge.write.finalizeWinner([bountyId, 0n], { account: owner.account }), /not judged yet/);
  });

  it("rejects finalize with an out-of-range winner index", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("ok");
    await judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account });
    await assert.rejects(judge.write.finalizeWinner([bountyId, 5n], { account: owner.account }), /invalid index/);
  });

  it("rejects finalize by a non-owner", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("ok");
    await judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account });
    await assert.rejects(judge.write.finalizeWinner([bountyId, 0n], { account: alice.account }), /not bounty owner/);
  });

  it("pays the winning submitter and closes the bounty", async () => {
    await submit(alice, "alice", SALT_A, "alice.enc");
    await submit(bob, "bob", SALT_B, "bob.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("ok");
    await judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account });

    const before = await publicClient.getBalance({ address: bob.account.address });
    await judge.write.finalizeWinner([bountyId, 1n], { account: owner.account }); // index 1 == bob
    const after = await publicClient.getBalance({ address: bob.account.address });
    assert.equal(after - before, parseEther("1"));

    const b = await judge.read.getBounty([bountyId]);
    assert.equal(b[6], true); // finalized
    assert.equal(b[8], 1n); // winnerIndex
    assert.equal(b[3], 0n); // reward drained
  });

  it("rejects finalize twice", async () => {
    await submit(alice, "x", SALT_A, "x.enc");
    await warpTo(subDeadline + 1n);
    await installLLM("ok");
    await judge.write.judgeAll([bountyId, "0x", BUNDLE_REF, BUNDLE_HASH], { account: owner.account });
    await judge.write.finalizeWinner([bountyId, 0n], { account: owner.account });
    await assert.rejects(judge.write.finalizeWinner([bountyId, 0n], { account: owner.account }), /already finalized/);
  });
});
