# Oracle of Broken Promises

**Bet on whether public figures keep their promises. AI jury reads the evidence. Winners take all.**

## Problem

Politicians promise. CEOs promise. Influencers promise. Nobody tracks whether they deliver, and when they don't, there's no consequence. Existing prediction markets handle binary outcomes (price above X, team wins Y) but can't resolve fuzzy commitments like "I'll fix the roads by December" or "We'll ship the feature in Q3."

Oracle of Broken Promises creates a decentralized accountability market where anyone can post a public promise, anyone can bet on whether it'll be kept, and an AI jury reads the actual evidence to settle the bet.

## How It Works

```
1. CREATE  →  Someone posts: "X promised Y by Z" + source URL + initial bet on KEPT
2. BET     →  Others bet KEPT or BROKEN (pool grows on both sides)
3. RESOLVE →  After deadline, anyone triggers resolution:
              Contract fetches source + verification URLs
              LLM jury reads evidence, delivers verdict
              Custom validator ensures jury agrees on MEANING (verdict field)
4. CLAIM   →  Winners claim: their_bet + (their_bet / winning_pool) * losing_pool
              PARTIAL/UNRESOLVABLE → all bets refunded
```

## Why This Dies Without GenLayer

- **"Did they keep it?"** is subjective. A promise to "fix roads" could mean repaving one street or the whole city. No oracle can reduce this to true/false.
- Contract **reads real web content** (news articles, official pages) directly on-chain via `gl.nondet.web.render` — no external oracle needed.
- **LLM reasoning** via `gl.nondet.exec_prompt` evaluates fuzzy fulfillment against the original promise text.
- **Validator consensus** via `gl.vm.run_nondet` with custom `validator_fn` — validators independently read the same sources and must agree on the **verdict** (KEPT/BROKEN/PARTIAL), not on the wording of their reasoning.

Remove GenLayer and you have... a trust-me-bro prediction market where one person decides.

## Architecture

```
Frontend (Vite/React, deployed on Vercel)
   └─ genlayer-js: createClient({ chain: studionet })
        └─ Intelligent Contract on studionet
             ├─ gl.nondet.web.render(source_url)        ← reads promise source
             ├─ gl.nondet.web.render(verification_url)  ← reads verification evidence
             ├─ gl.nondet.exec_prompt(...)              ← LLM judges fulfillment
             └─ gl.vm.run_nondet(leader_fn, validator_fn)
                  └─ validator compares verdict field only
                       └─ state updated on-chain → frontend reads via genlayer-js
```

## Deploy Contract on Studionet

1. Open [GenLayer Studio](https://studio.genlayer.com/contracts)
2. Settings → Reset Storage → Confirm → hard refresh (Cmd+Shift+R)
3. Create new contract, paste contents of `contracts/contract.py`
4. Deploy — click transaction in sidebar, verify `Result: SUCCESS`
5. Copy contract address
6. Fund your MetaMask wallet from Studio's **Accounts** panel

## Run Frontend Locally

```bash
cd frontend
cp .env.example .env
# Edit .env: set VITE_CONTRACT_ADDRESS=<your deployed address>
npm install
npm run dev
```

Open `http://localhost:5173`. Connect MetaMask (must be on Studionet with GEN balance).

## Deploy Frontend to Vercel

```bash
cd frontend
npm run build
npx vercel --prod
```

Set environment variable `VITE_CONTRACT_ADDRESS` in Vercel dashboard.

## Contract Address

**Studionet:** `<to be filled after deployment>`

## Tech Stack

- **Contract:** Python (GenLayer GenVM)
- **Consensus:** `gl.vm.run_nondet` with custom validator comparing verdict meaning
- **Frontend:** Vite + React 18 + TypeScript
- **Chain Integration:** genlayer-js + MetaMask
- **Network:** GenLayer studionet (chain ID 61999)
- **Hosting:** Vercel

## Video Demo

`<link to be added>`

## License

MIT
