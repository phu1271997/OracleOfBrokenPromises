# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


def _addr_str(addr) -> str:
    try:
        return addr.as_hex
    except Exception:
        return str(addr)


class Contract(gl.Contract):
    promises: TreeMap[str, str]          # promise_id -> JSON-encoded promise
    promise_count: u256
    bets_kept: TreeMap[str, str]         # "pid:addr" -> str(amount)
    bets_broken: TreeMap[str, str]       # "pid:addr" -> str(amount)
    min_bet: u256

    def __init__(self):
        self.promise_count = u256(0)
        self.min_bet = u256(100)

    def _load(self, promise_id: str) -> dict:
        raw = self.promises.get(promise_id, "")
        if not raw:
            raise gl.vm.UserError("Promise not found")
        return json.loads(raw)

    def _save(self, promise_id: str, p: dict) -> None:
        self.promises[promise_id] = json.dumps(p)

    @gl.public.write.payable
    def create_promise(
        self,
        promiser_name: str,
        promise_text: str,
        deadline: str,
        source_url: str,
        verification_url: str,
    ) -> None:
        creation_bond = int(gl.message.value)
        if creation_bond < int(self.min_bet):
            raise gl.vm.UserError("Creation bond below minimum")
        if not promiser_name.strip():
            raise gl.vm.UserError("Promiser name required")
        if not promise_text.strip():
            raise gl.vm.UserError("Promise text required")
        if not deadline.strip():
            raise gl.vm.UserError("Deadline required")
        if not source_url.strip():
            raise gl.vm.UserError("Source URL required")

        pid = str(int(self.promise_count))
        self.promise_count = u256(int(self.promise_count) + 1)

        sender = _addr_str(gl.message.sender)
        p = {
            "creator": sender,
            "promiser_name": promiser_name,
            "promise_text": promise_text,
            "deadline": deadline,
            "source_url": source_url,
            "verification_url": verification_url if verification_url.strip() else "",
            "pool_kept": str(creation_bond),
            "pool_broken": "0",
            "status": "OPEN",
            "verdict": "",
            "reason": "",
        }
        self._save(pid, p)

        bet_key = pid + ":" + sender
        self.bets_kept[bet_key] = str(creation_bond)

    @gl.public.write.payable
    def bet_kept(self, promise_id: str) -> None:
        p = self._load(promise_id)
        if p["status"] != "OPEN":
            raise gl.vm.UserError("Promise is not open for betting")
        today = gl.message_raw.get("datetime", "")[:10]
        if today and today >= p["deadline"]:
            raise gl.vm.UserError("Betting closed — deadline has passed")

        amount = int(gl.message.value)
        if amount < int(self.min_bet):
            raise gl.vm.UserError("Bet below minimum")

        sender = _addr_str(gl.message.sender)
        bet_key = promise_id + ":" + sender
        existing = int(self.bets_kept.get(bet_key, "0"))
        self.bets_kept[bet_key] = str(existing + amount)

        p["pool_kept"] = str(int(p["pool_kept"]) + amount)
        self._save(promise_id, p)

    @gl.public.write.payable
    def bet_broken(self, promise_id: str) -> None:
        p = self._load(promise_id)
        if p["status"] != "OPEN":
            raise gl.vm.UserError("Promise is not open for betting")
        today = gl.message_raw.get("datetime", "")[:10]
        if today and today >= p["deadline"]:
            raise gl.vm.UserError("Betting closed — deadline has passed")

        amount = int(gl.message.value)
        if amount < int(self.min_bet):
            raise gl.vm.UserError("Bet below minimum")

        sender = _addr_str(gl.message.sender)
        bet_key = promise_id + ":" + sender
        existing = int(self.bets_broken.get(bet_key, "0"))
        self.bets_broken[bet_key] = str(existing + amount)

        p["pool_broken"] = str(int(p["pool_broken"]) + amount)
        self._save(promise_id, p)

    @gl.public.write
    def resolve(self, promise_id: str) -> None:
        p = self._load(promise_id)
        if p["status"] != "OPEN":
            raise gl.vm.UserError("Promise already resolved")
        today = gl.message_raw.get("datetime", "")[:10]
        if today and today < p["deadline"]:
            raise gl.vm.UserError("Cannot resolve before deadline")

        promiser_name = p["promiser_name"]
        promise_text = p["promise_text"]
        deadline = p["deadline"]
        source_url = p["source_url"]
        verification_url = p["verification_url"]

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

        p["verdict"] = result.get("verdict", "UNRESOLVABLE")
        p["reason"] = result.get("reason", "")
        p["status"] = "RESOLVED"
        self._save(promise_id, p)

    @gl.public.write
    def claim_winnings(self, promise_id: str) -> None:
        p = self._load(promise_id)
        if p["status"] != "RESOLVED":
            raise gl.vm.UserError("Promise not yet resolved")

        caller = _addr_str(gl.message.sender)
        bet_key = promise_id + ":" + caller
        verdict = p["verdict"]

        if verdict == "KEPT":
            my_bet = int(self.bets_kept.get(bet_key, "0"))
            if my_bet == 0:
                raise gl.vm.UserError("No winning bet or already claimed")
            winning_pool = int(p["pool_kept"])
            losing_pool = int(p["pool_broken"])
            if winning_pool == 0:
                raise gl.vm.UserError("Empty winning pool")
            payout = my_bet + (my_bet * losing_pool) // winning_pool
            self.bets_kept[bet_key] = "0"
            gl.get_contract_at(Address(caller)).emit_transfer(value=u256(payout))

        elif verdict == "BROKEN":
            my_bet = int(self.bets_broken.get(bet_key, "0"))
            if my_bet == 0:
                raise gl.vm.UserError("No winning bet or already claimed")
            winning_pool = int(p["pool_broken"])
            losing_pool = int(p["pool_kept"])
            if winning_pool == 0:
                raise gl.vm.UserError("Empty winning pool")
            payout = my_bet + (my_bet * losing_pool) // winning_pool
            self.bets_broken[bet_key] = "0"
            gl.get_contract_at(Address(caller)).emit_transfer(value=u256(payout))

        elif verdict in ("PARTIAL", "UNRESOLVABLE"):
            kept_bet = int(self.bets_kept.get(bet_key, "0"))
            broken_bet = int(self.bets_broken.get(bet_key, "0"))
            total_refund = kept_bet + broken_bet
            if total_refund == 0:
                raise gl.vm.UserError("Nothing to claim")
            self.bets_kept[bet_key] = "0"
            self.bets_broken[bet_key] = "0"
            gl.get_contract_at(Address(caller)).emit_transfer(value=u256(total_refund))

        else:
            raise gl.vm.UserError("Invalid verdict state")

    @gl.public.view
    def get_promise(self, promise_id: str) -> str:
        p = self._load(promise_id)
        p["id"] = promise_id
        return json.dumps(p)

    @gl.public.view
    def get_promise_count(self) -> str:
        return str(int(self.promise_count))

    @gl.public.view
    def get_my_bets(self, promise_id: str, addr: str) -> str:
        bet_key = promise_id + ":" + addr
        return json.dumps({
            "kept": self.bets_kept.get(bet_key, "0"),
            "broken": self.bets_broken.get(bet_key, "0"),
        })
