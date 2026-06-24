import { createWalletClient, createPublicClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const art = JSON.parse(
  readFileSync("artifacts/contracts/AIJudge.sol/AIJudge.json", "utf8"),
);
const bytecode = typeof art.bytecode === "string" ? art.bytecode : art.bytecode.object;

const ritual = defineChain({
  id: 1979,
  name: "Ritual",
  nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
});

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const wc = createWalletClient({ account, chain: ritual, transport: http() });
const pc = createPublicClient({ chain: ritual, transport: http() });

console.log("deployer:", account.address);
const hash = await wc.deployContract({ abi: art.abi, bytecode, account, chain: ritual });
console.log("deploy tx:", hash);
const r = await pc.waitForTransactionReceipt({ hash });
console.log("AIJudge deployed at:", r.contractAddress, "| status:", r.status);
