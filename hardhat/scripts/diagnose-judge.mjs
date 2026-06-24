import { createPublicClient, http, defineChain, encodeAbiParameters, decodeAbiParameters, parseAbiParameters } from "viem";

const ritual = defineChain({ id: 1979, name: "Ritual", nativeCurrency: { name: "Ritual", symbol: "RIT", decimals: 18 }, rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } } });
const pc = createPublicClient({ chain: ritual, transport: http() });
const OWNER = "0x3c2F0A28931bD9FE91EA8a9AA07fA7b67caE0525";
const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F";

// 1. Does the frontend payload round-trip the canonical 30-field decode?
const llmParams = parseAbiParameters(
  "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)",
);
const payload = encodeAbiParameters(llmParams, [
  "0x0000000000000000000000000000000000000802", [], 300n, [], "0x",
  JSON.stringify([{ role: "user", content: "x" }]), "zai-org/GLM-4.7-FP8",
  0n, "", false, 8192n, "", "", 1n, false, 0n, "low", "0x", -1n, "", "", false,
  100n, "0x", "0x", -1n, 1000n, "", false, ["", "", ""],
]);
try {
  const decoded = decodeAbiParameters(llmParams, payload);
  console.log("1) payload round-trips canonical 30-field decode: YES  (field count OK)");
  console.log("   maxCompletionTokens field[10] =", decoded[10], "| stream[21]=", decoded[21], "| pii[28]=", decoded[28]);
} catch (e) { console.log("1) round-trip FAILED:", e.shortMessage || e.message); }

// 2. Valid LLM executors from TEEServiceRegistry (capability 1, checkValidity true)
const regAbi = [{
  name: "getServicesByCapability", type: "function", stateMutability: "view",
  inputs: [{ name: "capability", type: "uint8" }, { name: "checkValidity", type: "bool" }],
  outputs: [{ name: "services", type: "tuple[]", components: [
    { name: "node", type: "tuple", components: [
      { name: "paymentAddress", type: "address" }, { name: "teeAddress", type: "address" },
      { name: "teeType", type: "uint8" }, { name: "publicKey", type: "bytes" },
      { name: "endpoint", type: "string" }, { name: "certPubKeyHash", type: "bytes32" },
      { name: "capability", type: "uint8" } ] },
    { name: "isValid", type: "bool" }, { name: "workloadId", type: "bytes32" } ] }],
}];
try {
  const services = await pc.readContract({ address: TEE_REGISTRY, abi: regAbi, functionName: "getServicesByCapability", args: [1, true] });
  console.log(`\n2) Registered VALID LLM executors: ${services.length}`);
  for (const s of services) console.log("   teeAddress:", s.node.teeAddress, "| valid:", s.isValid);
  console.log("   frontend default executor 0x..0802 is registered? ",
    services.some((s) => s.node.teeAddress.toLowerCase() === "0x0000000000000000000000000000000000000802"));
} catch (e) { console.log("2) registry query failed:", e.shortMessage || e.message); }

// 3. Owner RitualWallet funding (judgeAll spends prepaid+locked RIT for the async LLM call)
const walletAbi = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "lockUntil", type: "function", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
try {
  const bal = await pc.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: "balanceOf", args: [OWNER] });
  let lock = 0n; try { lock = await pc.readContract({ address: RITUAL_WALLET, abi: walletAbi, functionName: "lockUntil", args: [OWNER] }); } catch {}
  console.log("\n3) Owner RitualWallet balanceOf:", bal, "wei =", Number(bal) / 1e18, "RIT | lockUntil:", lock);
  console.log("   need >= ~0.31 RIT escrow for one in-flight GLM-4.7-FP8 call (per ritual-dapp-llm).");
} catch (e) { console.log("3) wallet query failed:", e.shortMessage || e.message); }

// 4. Owner native balance + nonce (sanity)
console.log("\n4) Owner native balance:", Number(await pc.getBalance({ address: OWNER })) / 1e18, "RIT");
