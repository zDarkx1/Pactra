// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {BaseEscrowTest} from "./Base.t.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";
import {ReentrantWithdrawer} from "./Attackers.sol";
import {ToggleReceiver} from "./Attackers.sol";

contract PactraEscrowWithdrawalTest is BaseEscrowTest {
    function _settleToWorker(address worker_) internal returns (uint256 id) {
        vm.prank(buyer);
        id = escrow.createTask(
            worker_, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs()
        );
        vm.prank(worker_);
        escrow.acceptTask(id);
        vm.deal(buyer, _total());
        vm.prank(buyer);
        escrow.fundTask{value: _total()}(id);
        vm.warp(T_SUBMIT);
        vm.prank(worker_);
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
    }

    function test_Withdraw_PullBasedTransfer() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.WithdrawalExecuted(worker, AMOUNT0);
        vm.prank(worker);
        escrow.withdraw();
        assertEq(escrow.balances(worker), 0);
        assertEq(worker.balance, AMOUNT0);
        assertEq(address(escrow).balance, _total() - AMOUNT0);
    }

    function test_RevertWhen_NothingToWithdraw() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NothingToWithdraw.selector));
        escrow.withdraw();
    }

    function test_RevertWhen_WithdrawTwice() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.startPrank(worker);
        escrow.withdraw();
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NothingToWithdraw.selector));
        escrow.withdraw();
        vm.stopPrank();
        assertEq(worker.balance, AMOUNT0);
    }

    function test_RevertingReceiver_KeepsBalanceForRetry() public {
        ToggleReceiver receiver = new ToggleReceiver();
        uint256 id = _settleToWorker(address(receiver));

        vm.prank(address(receiver));
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.WithdrawalFailed.selector));
        escrow.withdraw();
        assertEq(escrow.balances(address(receiver)), AMOUNT0);
        assertEq(address(escrow).balance, _total());

        receiver.setAccepting(true);
        vm.prank(address(receiver));
        escrow.withdraw();
        assertEq(address(receiver).balance, AMOUNT0);
        assertEq(escrow.balances(address(receiver)), 0);
    }

    function test_ReentrantWithdraw_CannotDoubleSpend() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(escrow);
        uint256 id = _settleToWorker(address(attacker));

        attacker.setAttack(true);
        vm.prank(address(attacker));
        escrow.withdraw();
        assertEq(address(attacker).balance, AMOUNT0);
        assertEq(escrow.balances(address(attacker)), 0);
        assertEq(address(escrow).balance, _total() - AMOUNT0);
    }

    function test_RevertWhen_ReentrantWithdrawAfterBalanceZeroed() public {
        ReentrantWithdrawer attacker = new ReentrantWithdrawer(escrow);
        _settleToWorker(address(attacker));
        attacker.setAttack(true);
        vm.prank(address(attacker));
        escrow.withdraw();
        vm.prank(address(attacker));
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NothingToWithdraw.selector));
        attacker.withdraw();
    }

    function test_Withdraw_AggregatesAcrossTasks() public {
        uint256 first = _funded();
        _submit0(first);
        vm.prank(buyer);
        escrow.acceptDeliverable(first, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));

        vm.prank(buyer);
        uint256 second =
            escrow.createTask(worker, arbiter, backup, block.chainid, 2, keccak256("pactra-test-manifest"), _configs());
        vm.prank(worker);
        escrow.acceptTask(second);
        vm.deal(buyer, _total());
        vm.prank(buyer);
        escrow.fundTask{value: _total()}(second);
        vm.warp(T_SUBMIT + WINDOW1 + 100 days);
        vm.prank(worker);
        escrow.submitDeliverable(second, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.warp(block.timestamp + WINDOW0 + 1);
        vm.prank(worker);
        escrow.claimTimeout(second, 0);

        assertEq(escrow.balances(worker), AMOUNT0 * 2);
        vm.prank(worker);
        escrow.withdraw();
        assertEq(worker.balance, AMOUNT0 * 2);
    }

    function test_NoResidual_AfterFullSettlementAndWithdrawals() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.prank(worker);
        escrow.withdraw();

        vm.warp(T_SUBMIT);
        vm.prank(worker);
        escrow.submitDeliverable(id, 1, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.prank(buyer);
        escrow.openDispute(id, 1, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.prank(arbiter);
        escrow.resolveDispute(id, 1, AMOUNT1 / 2);
        vm.prank(worker);
        escrow.withdraw();
        vm.prank(buyer);
        escrow.withdraw();

        assertEq(address(escrow).balance, 0);
        assertEq(worker.balance, AMOUNT0 + AMOUNT1 / 2);
        assertEq(buyer.balance, AMOUNT1 / 2);
    }

    // ------------------------------------------------------- no admin drain

    function test_NoAdminDrainFunctions_Exist() public {
        address e = address(escrow);
        bool ok;
        (ok,) = e.call(abi.encodeWithSignature("sweep()"));
        assertFalse(ok);
        (ok,) = e.call(abi.encodeWithSignature("drain(address)", buyer));
        assertFalse(ok);
        (ok,) = e.call(abi.encodeWithSignature("withdrawAll()"));
        assertFalse(ok);
        (ok,) = e.call(abi.encodeWithSignature("transferTo(address,uint256)", buyer, 1));
        assertFalse(ok);
        (ok,) = e.call(abi.encodeWithSignature("setFee(uint256)", 1));
        assertFalse(ok);
        (ok,) = e.call(abi.encodeWithSignature("pause()"));
        assertFalse(ok);
        (ok,) = e.call(abi.encodeWithSignature("setArbiter(uint256,address,uint256)", 1, buyer, 0));
        assertFalse(ok);
    }

    function test_RevertWhen_PlainEthTransfer() public {
        vm.deal(address(this), 1 ether);
        (bool ok,) = address(escrow).call{value: 1}("");
        assertFalse(ok);
        assertEq(address(escrow).balance, 0);
    }
}
