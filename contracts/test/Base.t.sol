// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {Test} from "forge-std/Test.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";
import {FixtureAttestor} from "./FixtureAttestor.sol";

/// @dev Shared fixture: two deliverables, funded task ready for review.
contract BaseEscrowTest is Test {
    PactraEscrow internal escrow;
    address internal buyer = makeAddr("buyer");
    address internal worker = makeAddr("worker");
    address internal arbiter = makeAddr("arbiter");
    address internal backup = makeAddr("backup");
    address internal outsider = makeAddr("outsider");
    bytes32 internal manifest;

    uint128 internal constant AMOUNT0 = 1e16;
    uint128 internal constant AMOUNT1 = 2e16;
    uint64 internal constant WINDOW0 = 1 days;
    uint64 internal constant WINDOW1 = 2 days;
    uint16 internal constant LIMIT0 = 1;

    // Fixed submission anchor so deadline boundaries are exact.
    uint256 internal constant T_SUBMIT = 1 days;
    uint256 internal constant DEADLINE0 = T_SUBMIT + 1 days;

    function setUp() public virtual {
        escrow = new PactraEscrow(address(new FixtureAttestor()));
        manifest = escrow.manifestDigest(
            buyer, worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs()
        );
        vm.label(address(escrow), "escrow");
    }

    function _configs() internal view returns (PactraEscrow.DeliverableConfig[] memory c) {
        c = new PactraEscrow.DeliverableConfig[](2);
        c[0] = PactraEscrow.DeliverableConfig({
            amount: AMOUNT0, revisionLimit: LIMIT0, reviewWindow: WINDOW0, deliveryDeadline: 365 days
        });
        c[1] = PactraEscrow.DeliverableConfig({
            amount: AMOUNT1, revisionLimit: 0, reviewWindow: WINDOW1, deliveryDeadline: 365 days
        });
    }

    function _total() internal pure returns (uint256) {
        return uint256(AMOUNT0) + uint256(AMOUNT1);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(buyer);
        return
            escrow.createTask(worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
    }

    function _fund(uint256 id) internal {
        vm.deal(buyer, _total());
        vm.prank(buyer);
        escrow.fundTask{value: _total()}(id);
    }

    function _funded() internal returns (uint256 id) {
        id = _create();
        vm.prank(worker);
        escrow.acceptTask(id);
        _fund(id);
    }

    function _submit0(uint256 id) internal {
        vm.warp(T_SUBMIT);
        vm.prank(worker);
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
    }

    function _status(uint256 id, uint256 index) internal view returns (PactraEscrow.DeliverableStatus) {
        (,,, PactraEscrow.DeliverableStatus status,,,,,,) = escrow.getDeliverable(id, index);
        return status;
    }
}
