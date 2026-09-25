// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;
import {BaseEscrowTest} from "./Base.t.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";

contract ReviewConsentTest is BaseEscrowTest {
    bytes32 constant A = keccak256("fixture-artifact");
    bytes32 constant B = keccak256("replacement-artifact");

    function _reviewCall(uint8 action, uint256 id, uint256 round, bytes32 artifact, uint64 submittedAt)
        internal
        pure
        returns (bytes memory)
    {
        bytes4 selector = action == 0
            ? PactraEscrow.acceptDeliverable.selector
            : action == 1 ? PactraEscrow.requestRevision.selector : PactraEscrow.openDispute.selector;
        return abi.encodeWithSelector(selector, id, 0, round, artifact, submittedAt);
    }

    function _assertRejected(uint256 id, bytes memory frozen, address actor) internal {
        vm.prank(actor);
        (bool ok, bytes memory reason) = address(escrow).call(frozen);
        assertFalse(ok, "stale round-one consent paid for round two");
        assertEq(reason, abi.encodeWithSelector(PactraEscrow.ReviewEvidenceChanged.selector));
        assertEq(escrow.balances(worker), 0);
        assertEq(escrow.balances(buyer), 0);
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.InReview));
        assertEq(address(escrow).balance, _total());
    }

    function _replace(uint256 id, bytes32 artifact, uint64 timestamp) internal {
        vm.prank(buyer);
        escrow.requestRevision(id, 0, 1, A, uint64(T_SUBMIT));
        vm.warp(timestamp);
        vm.prank(worker);
        escrow.submitDeliverable(id, 0, artifact, type(uint64).max, hex"f1");
    }

    // RED first reproduced using the original selector, before source fixes.
    function testStaleRoundOneAcceptanceReverts() public {
        uint256 id = _funded();
        _submit0(id);
        bytes memory frozen = _reviewCall(0, id, 1, A, uint64(T_SUBMIT));
        _replace(id, B, uint64(T_SUBMIT + 1));
        _assertRejected(id, frozen, buyer);
        // Renewed consent to round two succeeds and pays only this allocation.
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 2, B, uint64(T_SUBMIT + 1));
        assertEq(escrow.balances(worker), AMOUNT0);
        assertEq(uint8(_status(id, 1)), uint8(PactraEscrow.DeliverableStatus.AwaitingSubmission));
    }

    function testFuzz_AllReviewActionsRejectStaleRound(
        uint8 action,
        bool workerDispute,
        bool sameArtifact,
        bool sameTimestamp
    ) public {
        action = uint8(bound(action, 0, 2));
        uint256 id = _funded();
        _submit0(id);
        bytes memory frozen = _reviewCall(action, id, 1, A, uint64(T_SUBMIT));
        // Even reusing identical bytes in the same block cannot reuse prior-round consent.
        _replace(id, sameArtifact ? A : B, uint64(sameTimestamp ? T_SUBMIT : T_SUBMIT + 1));
        _assertRejected(id, frozen, action == 2 && workerDispute ? worker : buyer);
    }

    function testFuzz_EachGuardIndependentlyEnforced(uint8 action, uint8 field) public {
        action = uint8(bound(action, 0, 2));
        field = uint8(bound(field, 0, 2));
        uint256 id = _funded();
        _submit0(id);
        _assertRejected(
            id,
            _reviewCall(
                action, id, field == 0 ? 2 : 1, field == 1 ? B : A, uint64(field == 2 ? T_SUBMIT + 1 : T_SUBMIT)
            ),
            buyer
        );
    }

    function testOldUnguardedSelectorsHaveNoBypass() public {
        uint256 id = _funded();
        _submit0(id);
        string[3] memory old =
            ["acceptDeliverable(uint256,uint256)", "requestRevision(uint256,uint256)", "openDispute(uint256,uint256)"];
        for (uint256 i; i < old.length; ++i) {
            vm.prank(buyer);
            (bool ok,) = address(escrow).call(abi.encodeWithSignature(old[i], id, 0));
            assertFalse(ok, "unguarded selector still callable");
        }
        assertEq(escrow.balances(worker), 0);
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.InReview));
    }
}
