import { createWalletClient, createPublicClient, http, defineChain, keccak256, encodePacked, toHex, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const art = JSON.parse(readFileSync("artifacts/contracts/AIJudge.sol/AIJudge.json", "utf8"));
const C = "0x09d9973048fdc9b8d9dd04575d25093df798b121";
const ritual = defineChain({ id: 1979, name: "Ritual", nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } } });
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const wc = createWalletClient({ account, chain: ritual, transport: http() });
const pc = createPublicClient({ chain: ritual, transport: http() });
const abi = art.abi;
const wait = (h) => pc.waitForTransactionReceipt({ hash: h });

const answer = "Use unchecked counters and pack structs into one slot.";
const salt = toHex("live-demo-salt-0001", { size: 32 });

const bountyId = await pc.readContract({ address: C, abi, functionName: "nextBountyId" });
console.log("bountyId will be:", bountyId);

const now = (await pc.getBlock()).timestamp; // Ritual timestamps are in milliseconds
const sub = now + 120_000n; // +2 min
const rev = now + 900_000n; // +15 min
console.log("creating bounty (submission +2m, reveal +15m, ms timestamps)...");
let h = await wc.writeContract({ address: C, abi, functionName: "createBounty", args: ["Live gas-opt", "Best gas savings + clarity", sub, rev], value: parseEther("0.001"), account, chain: ritual });
await wait(h);

const commitment = keccak256(encodePacked(["string", "bytes32", "address", "uint256"], [answer, salt, account.address, bountyId]));
console.log("committing (hash only)...");
h = await wc.writeContract({ address: C, abi, functionName: "submitCommitment", args: [bountyId, commitment], account, chain: ritual });
await wait(h);

let s = await pc.readContract({ address: C, abi, functionName: "getSubmission", args: [bountyId, 0n] });
console.log("after commit -> revealed:", s[2], "| answer on-chain:", JSON.stringify(s[3]), "(hidden)");

console.log("waiting for submission deadline to pass...");
while ((await pc.getBlock()).timestamp < sub) await new Promise((r) => setTimeout(r, 5000));

console.log("revealing...");
h = await wc.writeContract({ address: C, abi, functionName: "revealAnswer", args: [bountyId, answer, salt], account, chain: ritual });
await wait(h);

s = await pc.readContract({ address: C, abi, functionName: "getSubmission", args: [bountyId, 0n] });
console.log("after reveal  -> revealed:", s[2], "| answer on-chain:", JSON.stringify(s[3]));
console.log("\nLIVE commit-reveal verified on-chain. bountyId:", bountyId.toString());
