// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;
import {BaseEscrowTest} from "./Base.t.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";

contract SecurityRegressionTest is BaseEscrowTest {
    function test_ThirdPartyCannotSquatManifest() public {
        vm.prank(outsider);
        escrow.createTask(worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
        uint256 id = _create();
        assertEq(id, 2);
    }

    function test_BareSubmissionCannotStartReviewTimer() public {
        uint256 id = _funded();
        vm.prank(worker);
        (bool ok,) = address(escrow).call(abi.encodeWithSignature("submitDeliverable(uint256,uint256)", id, 0));
        assertFalse(ok, "unattested submission started timer");
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.AwaitingSubmission));
    }

    function test_ApprovedNoSubmissionRefundExists() public {
        uint256 id = _funded();
        vm.warp(366 days);
        vm.prank(buyer);
        (bool ok,) = address(escrow).call(abi.encodeWithSignature("refundUnsubmitted(uint256,uint256)", id, 0));
        assertTrue(ok, "approved no-submission refund missing");
        assertEq(escrow.balances(buyer), AMOUNT0);
    }
}
