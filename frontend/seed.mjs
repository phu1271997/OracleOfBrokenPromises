import { createClient, createAccount } from "genlayer-js";
import { readFileSync } from "fs";

const CHAIN = {
  id: 61999,
  name: "Genlayer Studio Network",
  rpcUrls: { default: { http: ["https://studio.genlayer.com/api"] } },
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
};
const ENDPOINT = "https://studio.genlayer.com/api";

// UPDATE THIS after redeploying the contract
const CONTRACT = "0xba9b91f159D08A0a1a84251B2559Cc3EF874E548";

function loadEnv() {
  try {
    const lines = readFileSync(".env.seed", "utf8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) process.env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    console.error("Missing .env.seed — copy .env.seed.example to .env.seed and fill in keys");
    process.exit(1);
  }
}

loadEnv();

const pk1 = process.env.PRIVATE_KEY_1;
const pk2 = process.env.PRIVATE_KEY_2;
if (!pk1 || !pk2) {
  console.error("Set PRIVATE_KEY_1 and PRIVATE_KEY_2 in .env.seed");
  process.exit(1);
}

const account1 = createAccount(pk1);
const account2 = createAccount(pk2);
const client1 = createClient({ chain: CHAIN, endpoint: ENDPOINT, account: account1 });
const client2 = createClient({ chain: CHAIN, endpoint: ENDPOINT, account: account2 });

async function write(client, fn, args, value = 0n, label = "") {
  console.log(`\n>>> ${label || fn}...`);
  try {
    const result = await client.writeContract({
      address: CONTRACT,
      functionName: fn,
      args,
      value,
    });
    console.log(`    OK:`, JSON.stringify(result).slice(0, 200));
    return result;
  } catch (e) {
    console.error(`    FAIL:`, e.message?.slice(0, 200) || e);
    return null;
  }
}

async function read(fn, args) {
  try {
    const r = await client1.readContract({ address: CONTRACT, functionName: fn, args });
    return typeof r === "string" ? r : String(r);
  } catch (e) {
    return null;
  }
}

async function main() {
  console.log("=== Oracle of Broken Promises — Seed Script (v2 with deadline gates) ===");
  console.log(`Wallet 1: ${account1.address}`);
  console.log(`Wallet 2: ${account2.address}`);
  console.log(`Contract: ${CONTRACT}`);

  const countBefore = parseInt(await read("get_promise_count", []) || "0", 10);
  console.log(`\nExisting promises: ${countBefore}`);

  // Promise A: PAST deadline — creator auto-bets KEPT, resolve immediately (expect KEPT)
  // Apple Vision Pro shipped Feb 2024
  await write(client1, "create_promise", [
    "Tim Cook",
    "Apple will release the Vision Pro headset in early 2024 starting at $3,499",
    "2024-06-30",
    "https://www.apple.com/newsroom/2023/06/introducing-apple-vision-pro/",
    "https://en.wikipedia.org/wiki/Apple_Vision_Pro",
  ], 1000n * 10n ** 18n, "Promise A — Apple Vision Pro, deadline 2024-06-30 (past, expect KEPT)");

  // Promise B: PAST deadline — creator auto-bets KEPT, resolve immediately (expect BROKEN)
  await write(client1, "create_promise", [
    "Elon Musk",
    "Tesla will produce 20 million vehicles per year by 2025",
    "2025-12-31",
    "https://en.wikipedia.org/wiki/Tesla,_Inc.",
    "https://en.wikipedia.org/wiki/Tesla,_Inc.",
  ], 1000n * 10n ** 18n, "Promise B — Tesla 20M, deadline 2025-12-31 (past, expect BROKEN)");

  // Promise C: FUTURE deadline — betting open, shows active market
  await write(client1, "create_promise", [
    "Sam Altman",
    "OpenAI will achieve AGI by 2030",
    "2030-12-31",
    "https://en.wikipedia.org/wiki/OpenAI",
    "",
  ], 1000n * 10n ** 18n, "Promise C — OpenAI AGI, deadline 2030-12-31 (future, active betting)");

  const promiseAId = String(countBefore);
  const promiseBId = String(countBefore + 1);
  const promiseCId = String(countBefore + 2);

  // Bet on Promise C (future deadline — betting still open)
  await write(client2, "bet_broken", [promiseCId], 500n * 10n ** 18n, `Bet BROKEN 500 GEN on Promise #${promiseCId} (AGI) from wallet 2`);
  await write(client2, "bet_kept", [promiseCId], 300n * 10n ** 18n, `Bet KEPT 300 GEN on Promise #${promiseCId} (AGI) from wallet 2`);

  // Resolve A and B (past deadlines — resolution allowed)
  console.log("\n=== Resolving past-deadline promises (AI consensus — 1-3 min each) ===");

  await write(client1, "resolve", [promiseAId], 0n, `Resolve #${promiseAId} — Vision Pro (past deadline)`);
  await write(client1, "resolve", [promiseBId], 0n, `Resolve #${promiseBId} — Tesla 20M (past deadline)`);

  // Claim winnings
  console.log("\n=== Claiming winnings ===");
  await write(client1, "claim_winnings", [promiseAId], 0n, `Wallet 1 claim on #${promiseAId} (should win if KEPT)`);

  // Verify final state
  console.log("\n=== Final state ===");
  const countAfter = parseInt(await read("get_promise_count", []) || "0", 10);
  for (let i = countBefore; i < countAfter; i++) {
    const raw = await read("get_promise", [String(i)]);
    if (raw) {
      const p = JSON.parse(raw);
      console.log(`Promise #${i}: status=${p.status} verdict=${p.verdict} pool_kept=${p.pool_kept} pool_broken=${p.pool_broken}`);
    }
  }
  console.log("\nDone. Check https://oracle-of-broken-promises.vercel.app");
}

main().catch(console.error);
