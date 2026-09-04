import json
import sys
import pytest
from gltest import ContractTest


def clear_known_contracts():
    for name, module in list(sys.modules.items()):
        if "genlayer" in name and hasattr(module, "__known_contract__"):
            setattr(module, "__known_contract__", None)


@pytest.fixture
def ct():
    clear_known_contracts()
    ct = ContractTest()
    ct.deploy_contract("contracts/contract.py")
    return ct


def install_mocks(ct, verdict="KEPT", confidence=90, reason="Promise was fulfilled"):
    ct.client.provider.make_request(
        method="sim_installMocks",
        params={
            "llm_mocks": {
                ".*": json.dumps({
                    "verdict": verdict,
                    "confidence": confidence,
                    "reason": reason,
                })
            },
            "web_mocks": {
                ".*": {"status": 200, "body": "News article confirming the promise outcome"},
            },
        },
    )


def create_promise(ct, account, bond=1000):
    ct.contract.connect(account).create_promise(
        args=[
            "Mayor Johnson",
            "Will fix all potholes on Main Street by end of year",
            "2026-12-31",
            "https://example.com/speech",
            "https://example.com/verify",
        ]
    ).transact(value=bond)


# ═══════════════════════════════════════════
#  FAST TESTS — no nondet / LLM calls
# ═══════════════════════════════════════════

class TestCreatePromiseFast:
    @pytest.mark.fast
    def test_create_success(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        assert ct.contract.get_promise_count(args=[]).call() == "1"

    @pytest.mark.fast
    def test_create_fields_stored(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator, bond=2000)
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["promiser_name"] == "Mayor Johnson"
        assert p["promise_text"] == "Will fix all potholes on Main Street by end of year"
        assert p["deadline"] == "2026-12-31"
        assert p["source_url"] == "https://example.com/speech"
        assert p["verification_url"] == "https://example.com/verify"
        assert p["pool_kept"] == "2000"
        assert p["pool_broken"] == "0"
        assert p["status"] == "OPEN"
        assert p["verdict"] == ""

    @pytest.mark.fast
    def test_create_low_bond(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).create_promise(
                args=["X", "Y", "2026-12-31", "https://x.com", ""]
            ).transact(value=10)

    @pytest.mark.fast
    def test_create_empty_name(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).create_promise(
                args=["", "Promise text", "2026-12-31", "https://x.com", ""]
            ).transact(value=1000)

    @pytest.mark.fast
    def test_create_empty_promise_text(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).create_promise(
                args=["Mayor", "", "2026-12-31", "https://x.com", ""]
            ).transact(value=1000)

    @pytest.mark.fast
    def test_create_empty_deadline(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).create_promise(
                args=["Mayor", "Fix roads", "", "https://x.com", ""]
            ).transact(value=1000)

    @pytest.mark.fast
    def test_create_empty_source_url(self, ct):
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).create_promise(
                args=["Mayor", "Fix roads", "2026-12-31", "", ""]
            ).transact(value=1000)

    @pytest.mark.fast
    def test_create_no_verification_url(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2026-12-31", "https://x.com/promise", ""]
        ).transact(value=1000)
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["verification_url"] == ""

    @pytest.mark.fast
    def test_multiple_promises_increment(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        create_promise(ct, creator)
        create_promise(ct, creator)
        assert ct.contract.get_promise_count(args=[]).call() == "3"

    @pytest.mark.fast
    def test_initial_count_zero(self, ct):
        assert ct.contract.get_promise_count(args=[]).call() == "0"

    @pytest.mark.fast
    def test_promise_not_found(self, ct):
        with pytest.raises(Exception):
            ct.contract.get_promise(args=["999"]).call()


class TestDeadlineGates:
    @pytest.mark.fast
    def test_bet_rejected_after_deadline(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2020-01-01", "https://x.com/promise", ""]
        ).transact(value=1000)
        bettor = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(bettor).bet_kept(args=["0"]).transact(value=500)

    @pytest.mark.fast
    def test_bet_broken_rejected_after_deadline(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2020-01-01", "https://x.com/promise", ""]
        ).transact(value=1000)
        bettor = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=500)

    @pytest.mark.slow
    def test_resolve_rejected_before_deadline(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2099-12-31", "https://x.com/promise", "https://x.com/verify"]
        ).transact(value=1000)
        install_mocks(ct)
        resolver = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(resolver).resolve(args=["0"]).transact()

    @pytest.mark.slow
    def test_resolve_allowed_after_deadline(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2020-01-01", "https://x.com/promise", "https://x.com/verify"]
        ).transact(value=1000)
        install_mocks(ct, verdict="BROKEN", reason="Deadline long passed")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["status"] == "RESOLVED"
        assert p["verdict"] == "BROKEN"


class TestBettingFast:
    @pytest.mark.fast
    def test_bet_kept_adds_to_pool(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_kept(args=["0"]).transact(value=500)
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["pool_kept"] == "1500"

    @pytest.mark.fast
    def test_bet_broken_adds_to_pool(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=500)
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["pool_broken"] == "500"

    @pytest.mark.fast
    def test_bet_below_minimum(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(bettor).bet_kept(args=["0"]).transact(value=10)

    @pytest.mark.fast
    def test_bet_not_found(self, ct):
        bettor = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(bettor).bet_kept(args=["99"]).transact(value=500)

    @pytest.mark.fast
    def test_bet_on_resolved_fails(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        install_mocks(ct, verdict="KEPT")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        bettor = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(bettor).bet_kept(args=["0"]).transact(value=500)

    @pytest.mark.fast
    def test_multiple_bets_accumulate(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=300)
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=200)
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["pool_broken"] == "500"

    @pytest.mark.fast
    def test_get_my_bets(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_kept(args=["0"]).transact(value=300)
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=200)
        bets = json.loads(ct.contract.get_my_bets(args=["0", bettor.address]).call())
        assert bets["kept"] == "300"
        assert bets["broken"] == "200"

    @pytest.mark.fast
    def test_get_my_bets_no_bets(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        stranger = ct.create_account()
        bets = json.loads(ct.contract.get_my_bets(args=["0", stranger.address]).call())
        assert bets["kept"] == "0"
        assert bets["broken"] == "0"


# ═══════════════════════════════════════════
#  SLOW TESTS — involve nondet / LLM mocks
# ═══════════════════════════════════════════

class TestResolveSlow:
    @pytest.mark.slow
    def test_resolve_kept(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        install_mocks(ct, verdict="KEPT", reason="Promise fulfilled on schedule")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["status"] == "RESOLVED"
        assert p["verdict"] == "KEPT"

    @pytest.mark.slow
    def test_resolve_broken(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        install_mocks(ct, verdict="BROKEN", reason="Deadline passed, no fulfillment")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["verdict"] == "BROKEN"

    @pytest.mark.slow
    def test_resolve_partial(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        install_mocks(ct, verdict="PARTIAL", reason="Some aspects fulfilled")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["verdict"] == "PARTIAL"

    @pytest.mark.slow
    def test_resolve_unresolvable(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        install_mocks(ct, verdict="UNRESOLVABLE", reason="Insufficient evidence")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["verdict"] == "UNRESOLVABLE"

    @pytest.mark.slow
    def test_double_resolve_fails(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        install_mocks(ct)
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        with pytest.raises(Exception):
            ct.contract.connect(resolver).resolve(args=["0"]).transact()

    @pytest.mark.slow
    def test_resolve_not_found(self, ct):
        install_mocks(ct)
        resolver = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(resolver).resolve(args=["99"]).transact()


class TestClaimWinningsSlow:
    @pytest.mark.slow
    def test_claim_winnings_kept_winner(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=500)
        install_mocks(ct, verdict="KEPT")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        ct.contract.connect(creator).claim_winnings(args=["0"]).transact()

    @pytest.mark.slow
    def test_claim_winnings_broken_winner(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=500)
        install_mocks(ct, verdict="BROKEN")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        ct.contract.connect(bettor).claim_winnings(args=["0"]).transact()

    @pytest.mark.slow
    def test_claim_not_resolved(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        with pytest.raises(Exception):
            ct.contract.connect(creator).claim_winnings(args=["0"]).transact()

    @pytest.mark.slow
    def test_claim_no_winning_bet(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        install_mocks(ct, verdict="BROKEN")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        stranger = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(stranger).claim_winnings(args=["0"]).transact()

    @pytest.mark.slow
    def test_claim_partial_refund(self, ct):
        creator = ct.create_account()
        create_promise(ct, creator)
        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=500)
        install_mocks(ct, verdict="PARTIAL")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        ct.contract.connect(creator).claim_winnings(args=["0"]).transact()
        ct.contract.connect(bettor).claim_winnings(args=["0"]).transact()


class TestLifecycleSlow:
    @pytest.mark.slow
    def test_full_lifecycle_kept(self, ct):
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=[
                "CEO Smith",
                "Ship Version 2.0 before Q3 2026",
                "2026-09-30",
                "https://example.com/announcement",
                "https://example.com/release",
            ]
        ).transact(value=2000)
        bettor1 = ct.create_account()
        ct.contract.connect(bettor1).bet_kept(args=["0"]).transact(value=500)
        bettor2 = ct.create_account()
        ct.contract.connect(bettor2).bet_broken(args=["0"]).transact(value=800)
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["pool_kept"] == "2500"
        assert p["pool_broken"] == "800"
        install_mocks(ct, verdict="KEPT", reason="Product shipped on schedule")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()
        p = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert p["status"] == "RESOLVED"
        assert p["verdict"] == "KEPT"
        ct.contract.connect(creator).claim_winnings(args=["0"]).transact()
        ct.contract.connect(bettor1).claim_winnings(args=["0"]).transact()
