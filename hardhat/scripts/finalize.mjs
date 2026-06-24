// Decode bounty 2's on-chain aiReview into the model's text verdict, then finalizeWinner.
import { createWalletClient, createPublicClient, http, defineChain, decodeAbiParameters, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const abi = JSON.parse(readFileSync("artifacts/contracts/AIJudge.sol/AIJudge.json", "utf8")).abi;
const C = "0x09d9973048fdc9b8d9dd04575d25093df798b121";
const BOUNTY_ID = BigInt(process.env.BOUNTY_ID ?? "2");
const ritual = defineChain({ id: 1979, name: "Ritual", nativeCurrency: { name: "Ritual", symbol: "RIT", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } } });
const account = privateKeyToAccount(process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : "0x" + process.env.PRIVATE_KEY);
const wc = createWalletClient({ account, chain: ritual, transport: http() });
const pc = createPublicClient({ chain: ritual, transport: http() });

const b = await pc.readContract({ address: C, abi, functionName: "getBounty", args: [BOUNTY_ID] });
const aiReview = b[10];
console.log("judged:", b[6], "| finalized:", b[7], "| aiReview bytes:", (aiReview.length - 2) / 2);

// completionData (aiReview) is ABI-encoded CompletionData (see ritual-dapp-llm Section 2).
let content = "";
try {
  const [, , , model, , , choicesCount, choicesData] = decodeAbiParameters(
    parseAbiParameters("string, string, uint256, string, string, string, uint256, bytes[], bytes"), aiReview);
  console.log("model:", model, "| choices:", choicesCount.toString());
  if (choicesData.length > 0) {
    const [, finishReason, messageData] = decodeAbiParameters(parseAbiParameters("uint256, string, bytes"), choicesData[0]);
    const [role, c] = decodeAbiParameters(parseAbiParameters("string, string, string, uint256, bytes[]"), messageData);
    content = c; console.log("finishReason:", finishReason, "| role:", role);
  }
} catch (e) { console.log("decode note:", e.shortMessage || e.message); }
console.log("\n--- MODEL VERDICT (content) ---\n" + (content || "(empty)") + "\n-------------------------------");

// Parse winnerIndex from the model JSON; fall back to 0 (only one revealed answer).
let winnerIndex = 0;
const m = content.match(/"winnerIndex"\s*:\s*(\d+)/);
if (m) winnerIndex = Number(m[1]);
const revealedCount = Number(b[8]);
if (winnerIndex >= revealedCount) winnerIndex = 0;
console.log("=> winnerIndex:", winnerIndex, "(of", revealedCount, "submissions)");

if (b[7]) { console.log("already finalized; nothing to do."); process.exit(0); }
console.log("finalizing...");
const h = await wc.writeContract({ address: C, abi, functionName: "finalizeWinner", args: [BOUNTY_ID, BigInt(winnerIndex)], account, chain: ritual });
const r = await pc.waitForTransactionReceipt({ hash: h });
console.log("finalizeWinner tx:", h, "| status:", r.status);
const b2 = await pc.readContract({ address: C, abi, functionName: "getBounty", args: [BOUNTY_ID] });
console.log("finalized:", b2[7], "| winnerIndex:", b2[9].toString(), "| reward left:", b2[3].toString());
