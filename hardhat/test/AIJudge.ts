import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseEther, keccak256, encodePacked, toHex, getAddress } from "viem";

const { viem } = await network.connect();

// commitment = keccak256(abi.encodePacked(answer, salt, submitter, bountyId))
function commitmentOf(
  answer: string,
  salt: `0x${string}`,
  submitter: `0x${string}`,
  bountyId: bigint,
) {
  return keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, getAddress(submitter), bountyId],
    ),
  );
}

const SALT_A = toHex("salt-alice-001", { size: 32 });
const SALT_B = toHex("salt-bob-002", { size: 32 });

describe("AIJudge commit-reveal", () => {
  let judge: any;
  let publicClient: any;
  let testClient: any;
  let owner: any, alice: any, bob: any;
  let bountyId: bigint;
  let subDeadline: bigint;
  let revDeadline: bigint;

  before(async () => {
    publicClient = await viem.getPublicClient();
    testClient = await viem.getTestClient();
    [owner, alice, bob] = await viem.getWalletClients();
  });

  beforeEach(async () => {
    judge = await viem.deployContract("AIJudge");
    const now = (await publicClient.getBlock()).timestamp;
    subDeadline = now + 1000n;
    revDeadline = now + 2000n;
    await judge.write.createBounty(
      ["Best haiku", "Judge clarity and wit", subDeadline, revDeadline],
      { value: parseEther("1") },
    );
    bountyId = 1n;
  });

  async function warpTo(ts: bigint) {
    await testClient.setNextBlockTimestamp({ timestamp: ts });
    await testClient.mine({ blocks: 1 });
  }

  it("hides the answer during the commit phase", async () => {
    const c = commitmentOf("roses are red", SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });

    const sub = await judge.read.getSubmission([bountyId, 0n]);
    // [submitter, commitment, revealed, answer]
    assert.equal(getAddress(sub[0]), getAddress(alice.account.address));
    assert.equal(sub[1], c);
    assert.equal(sub[2], false); // revealed
    assert.equal(sub[3], ""); // answer hidden
  });

  it("reveals a valid answer and stores it", async () => {
    const answer = "roses are red";
    const c = commitmentOf(answer, SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });

    await warpTo(subDeadline + 1n);
    await judge.write.revealAnswer([bountyId, answer, SALT_A], { account: alice.account });

    const sub = await judge.read.getSubmission([bountyId, 0n]);
    assert.equal(sub[2], true);
    assert.equal(sub[3], answer);
  });

  it("rejects a reveal with the wrong answer", async () => {
    const c = commitmentOf("real answer", SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });
    await warpTo(subDeadline + 1n);
    await assert.rejects(
      judge.write.revealAnswer([bountyId, "fake answer", SALT_A], { account: alice.account }),
      /commitment mismatch/,
    );
  });

  it("rejects a reveal with the wrong salt", async () => {
    const c = commitmentOf("real answer", SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });
    await warpTo(subDeadline + 1n);
    await assert.rejects(
      judge.write.revealAnswer([bountyId, "real answer", SALT_B], { account: alice.account }),
      /commitment mismatch/,
    );
  });

  it("rejects a reveal during the commit phase", async () => {
    const answer = "early bird";
    const c = commitmentOf(answer, SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });
    await assert.rejects(
      judge.write.revealAnswer([bountyId, answer, SALT_A], { account: alice.account }),
      /reveal not open/,
    );
  });

  it("rejects a reveal after the reveal deadline", async () => {
    const answer = "too late";
    const c = commitmentOf(answer, SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });
    await warpTo(revDeadline + 1n);
    await assert.rejects(
      judge.write.revealAnswer([bountyId, answer, SALT_A], { account: alice.account }),
      /reveal closed/,
    );
  });

  it("rejects a reveal from an address that never committed", async () => {
    await warpTo(subDeadline + 1n);
    await assert.rejects(
      judge.write.revealAnswer([bountyId, "whatever", SALT_A], { account: bob.account }),
      /no commitment/,
    );
  });

  it("rejects a double reveal", async () => {
    const answer = "once only";
    const c = commitmentOf(answer, SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });
    await warpTo(subDeadline + 1n);
    await judge.write.revealAnswer([bountyId, answer, SALT_A], { account: alice.account });
    await assert.rejects(
      judge.write.revealAnswer([bountyId, answer, SALT_A], { account: alice.account }),
      /already revealed/,
    );
  });

  it("rejects a commitment after the submission deadline", async () => {
    await warpTo(subDeadline + 1n);
    const c = commitmentOf("late", SALT_B, bob.account.address, bountyId);
    await assert.rejects(
      judge.write.submitCommitment([bountyId, c], { account: bob.account }),
      /submissions closed/,
    );
  });

  it("rejects a second commitment from the same address", async () => {
    const c = commitmentOf("first", SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });
    await assert.rejects(
      judge.write.submitCommitment([bountyId, c], { account: alice.account }),
      /already committed/,
    );
  });

  it("rejects judging before the reveal phase is over", async () => {
    const c = commitmentOf("x", SALT_A, alice.account.address, bountyId);
    await judge.write.submitCommitment([bountyId, c], { account: alice.account });
    await warpTo(subDeadline + 1n);
    await judge.write.revealAnswer([bountyId, "x", SALT_A], { account: alice.account });
    await assert.rejects(
      judge.write.judgeAll([bountyId, "0x"], { account: owner.account }),
      /reveal not finished/,
    );
  });
});
