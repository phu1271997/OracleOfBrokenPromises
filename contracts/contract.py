# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json
from datetime import date
from dataclasses import dataclass


def _addr_str(addr) -> str:
    try:
        return addr.as_hex
    except Exception:
        return str(addr)


@allow_storage
@dataclass
class Promise:
    creator: str
    promiser_name: str
    promise_text: str
    deadline: str
    source_url: str
    verification_url: str
    pool_kept: bigint
    pool_broken: bigint
    status: str
    verdict: str
    reason: str


class Contract(gl.Contract):
    promises: TreeMap[str, Promise]
    promise_count: bigint
    bets_kept: TreeMap[str, str]
    bets_broken: TreeMap[str, str]
    min_bet: bigint

    def __init__(self):
        self.promise_count = bigint(0)
        self.min_bet = bigint(100)

    @gl.public.write.payable
    def create_promise(
        self,
        promiser_name: str,
        promise_text: str,
        deadline: str,
        source_url: str,
        verification_url: str,
    ) -> None:
        creation_bond = bigint(gl.message.value)
        if creation_bond < self.min_bet:
            raise gl.UserError("Creation bond below minimum")
        if not promiser_name.strip():
            raise gl.UserError("Promiser name required")
        if not promise_text.strip():
            raise gl.UserError("Promise text required")
        if not deadline.strip():
            raise gl.UserError("Deadline required")
        if not source_url.strip():
            raise gl.UserError("Source URL required")

        pid = str(self.promise_count)
        self.promise_count += bigint(1)

        self.promises[pid] = Promise(
            creator=_addr_str(gl.message.sender),
            promiser_name=promiser_name,
            promise_text=promise_text,
            deadline=deadline,
            source_url=source_url,
            verification_url=verification_url if verification_url.strip() else "",
            pool_kept=creation_bond,
            pool_broken=bigint(0),
            status="OPEN",
            verdict="",
            reason="",
        )

        bet_key = pid + ":" + _addr_str(gl.message.sender)
        self.bets_kept[bet_key] = str(creation_bond)

    @gl.public.write.payable
    def bet_kept(self, promise_id: str) -> None:
        if promise_id not in self.promises:
            raise gl.UserError("Promise not found")
        p = self.promises[promise_id]
        if p.status != "OPEN":
            raise gl.UserError("Promise is not open for betting")
        if str(date.today()) >= p.deadline:
            raise gl.UserError("Betting closed — deadline has passed")

        amount = bigint(gl.message.value)
        if amount < self.min_bet:
            raise gl.UserError("Bet below minimum")

        bet_key = promise_id + ":" + _addr_str(gl.message.sender)
        existing = bigint(0)
        if bet_key in self.bets_kept:
            existing = bigint(int(self.bets_kept[bet_key]))
        self.bets_kept[bet_key] = str(existing + amount)

        p.pool_kept += amount
        self.promises[promise_id] = p

    @gl.public.write.payable
    def bet_broken(self, promise_id: str) -> None:
        if promise_id not in self.promises:
            raise gl.UserError("Promise not found")
        p = self.promises[promise_id]
        if p.status != "OPEN":
            raise gl.UserError("Promise is not open for betting")
        if str(date.today()) >= p.deadline:
            raise gl.UserError("Betting closed — deadline has passed")

        amount = bigint(gl.message.value)
        if amount < self.min_bet:
            raise gl.UserError("Bet below minimum")

        bet_key = promise_id + ":" + _addr_str(gl.message.sender)
        existing = bigint(0)
        if bet_key in self.bets_broken:
            existing = bigint(int(self.bets_broken[bet_key]))
        self.bets_broken[bet_key] = str(existing + amount)

        p.pool_broken += amount
        self.promises[promise_id] = p

    @gl.public.write
    def resolve(self, promise_id: str) -> None:
        if promise_id not in self.promises:
            raise gl.UserError("Promise not found")
        p = self.promises[promise_id]
        if p.status != "OPEN":
            raise gl.UserError("Promise already resolved")
        if str(date.today()) < p.deadline:
            raise gl.UserError("Cannot resolve before deadline")

        promiser_name = p.promiser_name
        promise_text = p.promise_text
        deadline = p.deadline
        source_url = p.source_url
        verification_url = p.verification_url

        def leader_fn():
            source_content = gl.nondet.web.render(source_url, mode="text")
            if not source_content or len(source_content.strip()) < 10:
                return json.dumps({
                    "verdict": "UNRESOLVABLE",
                    "confidence": 0,
                    "reason": "Could not fetch the source of the promise"
                })

            verification_content = ""
            if verification_url:
                verification_content = gl.nondet.web.render(verification_url, mode="text")

            prompt = f"""You are an impartial judge for a promise prediction market.

A public figure made a promise. You must determine if they kept it.

PROMISER: {promiser_name}
PROMISE: "{promise_text}"
DEADLINE: {deadline}

=== SOURCE (where the promise was made) ===
{source_content[:3000]}

=== VERIFICATION SOURCE ===
{verification_content[:3000] if verification_content else "(no verification URL provided)"}

RULES:
1. KEPT — clear evidence the promise was substantially fulfilled by the deadline.
2. BROKEN — clear evidence the deadline passed without fulfillment, or the promiser contradicted/abandoned the promise.
3. PARTIAL — some aspects fulfilled but key elements missing; ambiguous outcome.
4. UNRESOLVABLE — insufficient evidence to determine either way from available sources.

Respond ONLY with valid JSON (no markdown, no code fences):
{{"verdict": "KEPT" | "BROKEN" | "PARTIAL" | "UNRESOLVABLE", "confidence": <integer 0-100>, "reason": "<one paragraph explanation>"}}"""

            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            try:
                leader_data = leader_res.calldata
                if isinstance(leader_data, str):
                    leader_data = json.loads(leader_data)
                my_result = leader_fn()
                if isinstance(my_result, str):
                    my_result = json.loads(my_result)
                return my_result["verdict"] == leader_data["verdict"]
            except Exception:
                return False

        result = gl.vm.run_nondet(leader_fn, validator_fn)
        if isinstance(result, str):
            result = json.loads(result)

        verdict = result.get("verdict", "UNRESOLVABLE")
        reason = result.get("reason", "")

        p.verdict = verdict
        p.reason = reason
        p.status = "RESOLVED"
        self.promises[promise_id] = p

    @gl.public.write
    def claim_winnings(self, promise_id: str) -> None:
        if promise_id not in self.promises:
            raise gl.UserError("Promise not found")
        p = self.promises[promise_id]
        if p.status != "RESOLVED":
            raise gl.UserError("Promise not yet resolved")

        caller = _addr_str(gl.message.sender)
        bet_key = promise_id + ":" + caller

        if p.verdict == "KEPT":
            if bet_key not in self.bets_kept:
                raise gl.UserError("No winning bet found")
            my_bet = bigint(int(self.bets_kept[bet_key]))
            if my_bet == bigint(0):
                raise gl.UserError("Already claimed")
            winning_pool = p.pool_kept
            losing_pool = p.pool_broken
            if winning_pool == bigint(0):
                raise gl.UserError("Empty winning pool")
            payout = my_bet + (my_bet * losing_pool) // winning_pool
            self.bets_kept[bet_key] = "0"
            gl.get_contract_at(Address(caller)).emit_transfer(value=u256(payout))

        elif p.verdict == "BROKEN":
            if bet_key not in self.bets_broken:
                raise gl.UserError("No winning bet found")
            my_bet = bigint(int(self.bets_broken[bet_key]))
            if my_bet == bigint(0):
                raise gl.UserError("Already claimed")
            winning_pool = p.pool_broken
            losing_pool = p.pool_kept
            if winning_pool == bigint(0):
                raise gl.UserError("Empty winning pool")
            payout = my_bet + (my_bet * losing_pool) // winning_pool
            self.bets_broken[bet_key] = "0"
            gl.get_contract_at(Address(caller)).emit_transfer(value=u256(payout))

        elif p.verdict in ("PARTIAL", "UNRESOLVABLE"):
            kept_bet = bigint(0)
            broken_bet = bigint(0)
            if bet_key in self.bets_kept:
                kept_bet = bigint(int(self.bets_kept[bet_key]))
            if bet_key in self.bets_broken:
                broken_bet = bigint(int(self.bets_broken[bet_key]))
            total_refund = kept_bet + broken_bet
            if total_refund == bigint(0):
                raise gl.UserError("Nothing to claim")
            if bet_key in self.bets_kept:
                self.bets_kept[bet_key] = "0"
            if bet_key in self.bets_broken:
                self.bets_broken[bet_key] = "0"
            gl.get_contract_at(Address(caller)).emit_transfer(value=u256(total_refund))

        else:
            raise gl.UserError("Invalid verdict state")

    @gl.public.view
    def get_promise(self, promise_id: str) -> str:
        if promise_id not in self.promises:
            raise gl.UserError("Promise not found")
        p = self.promises[promise_id]
        return json.dumps({
            "id": promise_id,
            "creator": p.creator,
            "promiser_name": p.promiser_name,
            "promise_text": p.promise_text,
            "deadline": p.deadline,
            "source_url": p.source_url,
            "verification_url": p.verification_url,
            "pool_kept": str(p.pool_kept),
            "pool_broken": str(p.pool_broken),
            "status": p.status,
            "verdict": p.verdict,
            "reason": p.reason,
        })

    @gl.public.view
    def get_promise_count(self) -> str:
        return str(self.promise_count)

    @gl.public.view
    def get_my_bets(self, promise_id: str, addr: str) -> str:
        bet_key = promise_id + ":" + addr
        kept = "0"
        broken = "0"
        if bet_key in self.bets_kept:
            kept = self.bets_kept[bet_key]
        if bet_key in self.bets_broken:
            broken = self.bets_broken[bet_key]
        return json.dumps({"kept": kept, "broken": broken})
