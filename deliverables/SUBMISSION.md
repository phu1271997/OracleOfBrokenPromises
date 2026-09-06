# Oracle of Broken Promises — Explorer Submission

## Basic Info

- **Name**: Oracle of Broken Promises
- **Category**: DeFi / Prediction Market
- **Logo**: `logo-1024.png` (1024x1024) + `logo-512.png` (512x512)

---

## Short Description (max 160 chars)

Promise prediction market where AI reads the evidence, validators reach consensus, and bettors get paid for correctly calling KEPT or BROKEN.

> 142 chars

---

## Long Description (max 500 chars)

Oracle of Broken Promises is a decentralized prediction market for public figure accountability built on GenLayer. Users record promises with source URLs and stake GEN on outcomes. The contract fetches evidence on-chain via gl.nondet.web.render, an LLM judges fulfillment via gl.nondet.exec_prompt, and validators verify through gl.vm.run_nondet. Four verdicts: KEPT, BROKEN, PARTIAL, UNRESOLVABLE. Winners split the losing pool proportionally. PARTIAL and UNRESOLVABLE trigger full refunds to all bettors.

> 499 chars

---

## Contract Address

```
0x80D5E52819Cc36505c9AC1a3cA084b1A4EA85d0c
```

Network: GenLayer Studionet (Chain ID 61999)

---

## Links

- **Frontend**: https://oracle-of-broken-promises-ten.vercel.app
- **GitHub**: https://github.com/phu1271997/OracleOfBrokenPromises
- **Explorer**: https://explorer-studio.genlayer.com/address/0x80D5E52819Cc36505c9AC1a3cA084b1A4EA85d0c

---

## GenLayer Features Used

| Feature | Method | Purpose |
|---------|--------|---------|
| `gl.nondet.web.render` | `resolve()` | Fetches source + verification URLs on-chain |
| `gl.nondet.exec_prompt` | `resolve()` | LLM judges promise fulfillment against evidence |
| `gl.vm.run_nondet` | `resolve()` | Validators independently verify verdict matches leader |
| `gl.public.write.payable` | `create_promise()`, `bet_kept()`, `bet_broken()` | Accepts token stakes |
| `gl.get_contract_at().emit_transfer` | `claim_winnings()` | Pays out winners proportionally |

---

## Smart Contract Methods

| Method | Type | Description |
|--------|------|-------------|
| `create_promise(name, text, deadline, source, verify)` | write/payable | Record promise, auto-bet KEPT with bond |
| `bet_kept(promise_id)` | write/payable | Stake GEN that promise will be kept |
| `bet_broken(promise_id)` | write/payable | Stake GEN that promise will be broken |
| `resolve(promise_id)` | write/nondet | AI reads evidence, validators verify, delivers verdict |
| `claim_winnings(promise_id)` | write | Claim proportional payout or refund |
| `get_promise(promise_id)` | view | Returns full promise data as JSON |
| `get_promise_count()` | view | Returns total number of promises |
| `get_my_bets(promise_id, addr)` | view | Returns caller's bet amounts (kept + broken) |

---

## How It Works

1. **Post** — Record a public figure's promise with source URL + optional verification URL. Bond auto-bets KEPT.
2. **Bet** — Anyone stakes GEN on KEPT or BROKEN while promise is OPEN
3. **Resolve** — Anyone triggers AI judgment:
   - Contract fetches source + verification URLs via `gl.nondet.web.render`
   - LLM evaluates fulfillment via `gl.nondet.exec_prompt`
   - Validators independently run same analysis
   - Consensus determines: KEPT, BROKEN, PARTIAL, or UNRESOLVABLE
4. **Claim** — Winners split losers' pool proportionally. PARTIAL/UNRESOLVABLE = full refund.

---

## Test Suite

```bash
# Fast tests (no LLM, deterministic)
pytest tests/ -m fast -v

# Slow tests (mocked LLM + web)
pytest tests/ -m slow -v

# All tests
pytest tests/ -v
```

Coverage: 30 tests (20 fast, 10 slow) covering create validation, betting pools, bet accumulation, deadline gates (bet rejection after deadline, resolve rejection before deadline), all 4 verdict types, claim winnings, refund logic, double-resolve prevention, and full lifecycle.
