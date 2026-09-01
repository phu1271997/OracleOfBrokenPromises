import json
import sys
import pytest
from gltest import ContractTest


def clear_known_contracts():
    for name, module in list(sys.modules.items()):
        if "genlayer" in name and hasattr(module, "__known_contract__"):
            setattr(module, "__known_contract__", None)


@pytest.fixture
def test_setup():
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


class TestCreatePromise:
    def test_create_success(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=[
                "Mayor Johnson",
                "Will fix all potholes on Main Street",
                "2026-12-31",
                "https://example.com/speech",
                "https://example.com/verify",
            ]
        ).transact(value=1000)

        result = ct.contract.get_promise_count(args=[]).call()
        assert result == "1"

    def test_create_low_bond(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        with pytest.raises(Exception):
            ct.contract.connect(creator).create_promise(
                args=["X", "Y", "2026-12-31", "https://x.com", ""]
            ).transact(value=10)


class TestBetting:
    def test_bet_kept(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2026-12-31", "https://x.com/promise", ""]
        ).transact(value=1000)

        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_kept(args=["0"]).transact(value=500)

        promise = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert promise["pool_kept"] == "1500"

    def test_bet_broken(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2026-12-31", "https://x.com/promise", ""]
        ).transact(value=1000)

        bettor = ct.create_account()
        ct.contract.connect(bettor).bet_broken(args=["0"]).transact(value=500)

        promise = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert promise["pool_broken"] == "500"


class TestResolve:
    def test_resolve_kept(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2026-12-31", "https://x.com/promise", "https://x.com/verify"]
        ).transact(value=1000)

        install_mocks(ct, verdict="KEPT")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()

        promise = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert promise["status"] == "RESOLVED"
        assert promise["verdict"] == "KEPT"

    def test_resolve_broken(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["CEO", "Ship product", "2026-06-01", "https://x.com/tweet", ""]
        ).transact(value=1000)

        install_mocks(ct, verdict="BROKEN", reason="Deadline passed, no product shipped")
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()

        promise = json.loads(ct.contract.get_promise(args=["0"]).call())
        assert promise["verdict"] == "BROKEN"

    def test_double_resolve_fails(self, test_setup):
        ct = test_setup
        creator = ct.create_account()
        ct.contract.connect(creator).create_promise(
            args=["Mayor", "Fix roads", "2026-12-31", "https://x.com", ""]
        ).transact(value=1000)

        install_mocks(ct)
        resolver = ct.create_account()
        ct.contract.connect(resolver).resolve(args=["0"]).transact()

        with pytest.raises(Exception):
            ct.contract.connect(resolver).resolve(args=["0"]).transact()
