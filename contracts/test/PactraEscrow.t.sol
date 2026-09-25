// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {BaseEscrowTest} from "./Base.t.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";

contract PactraEscrowLifecycleTest is BaseEscrowTest {
    // ------------------------------------------------------------ creation

    function test_CreateTask_StoresImmutableConfiguration() public {
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.TaskCreated(1, buyer, worker, arbiter, backup, manifest, block.chainid, 2);
        uint256 id = _create();

        (
            address b,
            address w,
            address a,
            address bk,
            bytes32 m,
            uint256 chain,
            PactraEscrow.TaskStatus status,
            uint256 count,
            uint256 settled
        ) = escrow.getTask(id);
        assertEq(b, buyer);
        assertEq(w, worker);
        assertEq(a, arbiter);
        assertEq(bk, backup);
        assertEq(m, manifest);
        assertEq(uint256(chain), block.chainid);
        assertEq(uint8(status), uint8(PactraEscrow.TaskStatus.AwaitingWorker));
        assertEq(count, 2);
        assertEq(settled, 0);
        assertEq(escrow.totalAllocation(id), _total());
        assertTrue(escrow.boundManifests(manifest));
    }

    function test_RevertWhen_WorkerIsBuyer() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidParties.selector));
        escrow.createTask(buyer, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
    }

    function test_RevertWhen_ArbiterAbsent() public {
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidParties.selector));
        escrow.createTask(worker, address(0), backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidParties.selector));
        escrow.createTask(worker, arbiter, address(0), block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
        vm.stopPrank();
    }

    function test_RevertWhen_ArbiterIsPartyOrDuplicate() public {
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidParties.selector));
        escrow.createTask(worker, buyer, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidParties.selector));
        escrow.createTask(worker, worker, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidParties.selector));
        escrow.createTask(worker, arbiter, arbiter, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
        vm.stopPrank();
    }

    function test_RevertWhen_DeliverablesInvalid() public {
        PactraEscrow.DeliverableConfig[] memory none = new PactraEscrow.DeliverableConfig[](0);
        PactraEscrow.DeliverableConfig[] memory zeroAmount = new PactraEscrow.DeliverableConfig[](1);
        zeroAmount[0] = PactraEscrow.DeliverableConfig({
            amount: 0, revisionLimit: 0, reviewWindow: 1 days, deliveryDeadline: 365 days
        });
        PactraEscrow.DeliverableConfig[] memory zeroWindow = new PactraEscrow.DeliverableConfig[](1);
        zeroWindow[0] =
            PactraEscrow.DeliverableConfig({amount: 1, revisionLimit: 0, reviewWindow: 0, deliveryDeadline: 365 days});
        PactraEscrow.DeliverableConfig[] memory tooMany =
            new PactraEscrow.DeliverableConfig[](escrow.MAX_DELIVERABLES() + 1);

        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidDeliverables.selector));
        escrow.createTask(worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), none);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidDeliverables.selector));
        escrow.createTask(worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), zeroAmount);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidDeliverables.selector));
        escrow.createTask(worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), zeroWindow);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidDeliverables.selector));
        escrow.createTask(worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), tooMany);
        vm.stopPrank();
    }

    function test_RevertWhen_ManifestZero() public {
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.InvalidManifest.selector));
        escrow.createTask(worker, arbiter, backup, block.chainid, 1, bytes32(0), _configs());
    }

    function test_RevertWhen_ManifestAlreadyBound() public {
        _create();
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.ManifestAlreadyBound.selector));
        escrow.createTask(worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs());
    }

    function test_ManifestAndAllocationImmutable_NoSettersExist() public {
        uint256 id = _funded();
        address e = address(escrow);
        bool ok;
        (ok,) = e.call(abi.encodeWithSignature("setManifestHash(uint256,bytes32)", id, bytes32(uint256(7))));
        assertFalse(ok);
        (ok,) = e.call(abi.encodeWithSignature("setArbiter(uint256,address)", id, outsider));
        assertFalse(ok);
        (ok,) = e.call(
            abi.encodeWithSignature("setDeliverable(uint256,uint256,uint128,uint16,uint64)", id, 0, uint128(9), 0, 0)
        );
        assertFalse(ok);
        (,,,, bytes32 m,,,,) = escrow.getTask(id);
        assertEq(m, manifest);
        assertEq(escrow.totalAllocation(id), _total());
    }

    // ------------------------------------------------------ acceptance/fund

    function test_WorkerAcceptance_ReachesAcceptedUnfunded() public {
        uint256 id = _create();
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.WorkerAccepted(id, worker);
        vm.prank(worker);
        escrow.acceptTask(id);
        (,,,,,, PactraEscrow.TaskStatus status,,) = escrow.getTask(id);
        assertEq(uint8(status), uint8(PactraEscrow.TaskStatus.AcceptedUnfunded));
        assertEq(address(escrow).balance, 0);
    }

    function test_RevertWhen_NonWorkerAcceptsTask() public {
        uint256 id = _create();
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotTaskWorker.selector));
        escrow.acceptTask(id);
    }

    function test_RevertWhen_AcceptTaskTwice() public {
        uint256 id = _create();
        vm.startPrank(worker);
        escrow.acceptTask(id);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.TaskNotAwaitingWorker.selector));
        escrow.acceptTask(id);
        vm.stopPrank();
    }

    function test_RevertWhen_FundBeforeWorkerAcceptance() public {
        uint256 id = _create();
        vm.deal(buyer, _total());
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.TaskNotAcceptedUnfunded.selector));
        escrow.fundTask{value: _total()}(id);
    }

    function test_RevertWhen_NonBuyerFunds() public {
        uint256 id = _create();
        vm.prank(worker);
        escrow.acceptTask(id);
        vm.deal(worker, _total());
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotTaskBuyer.selector));
        escrow.fundTask{value: _total()}(id);
    }

    function test_RevertWhen_FundingAmountWrong() public {
        uint256 id = _create();
        vm.prank(worker);
        escrow.acceptTask(id);
        vm.deal(buyer, 10 ether);
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.WrongFundingAmount.selector));
        escrow.fundTask{value: _total() - 1}(id);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.WrongFundingAmount.selector));
        escrow.fundTask{value: _total() + 1}(id);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.WrongFundingAmount.selector));
        escrow.fundTask{value: 0}(id);
        vm.stopPrank();
        assertEq(address(escrow).balance, 0);
    }

    function test_RevertWhen_FundTaskTwice() public {
        uint256 id = _funded();
        vm.deal(buyer, _total());
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.TaskNotAcceptedUnfunded.selector));
        escrow.fundTask{value: _total()}(id);
        assertEq(address(escrow).balance, _total());
    }

    // ---------------------------------------------------------- submission

    function test_SubmitDeliverable_RecordsRound() public {
        uint256 id = _funded();
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.SubmissionRecorded(id, 0, 1);
        _submit0(id);
        (,,,,, uint64 submittedAt,,,,) = escrow.getDeliverable(id, 0);
        assertEq(submittedAt, T_SUBMIT);
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.InReview));
    }

    function test_RevertWhen_SubmitBeforeFunding() public {
        uint256 id = _create();
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.TaskNotFunded.selector));
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
    }

    function test_RevertWhen_NonWorkerSubmits() public {
        uint256 id = _funded();
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotTaskWorker.selector));
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
    }

    function test_RevertWhen_SubmitTwiceWithoutRevision() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableNotAwaitingSubmission.selector));
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
    }

    function test_RevertWhen_DeliverableIndexOutOfRange() public {
        uint256 id = _funded();
        vm.startPrank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableOutOfRange.selector));
        escrow.submitDeliverable(id, 2, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableOutOfRange.selector));
        escrow.submitDeliverable(id, type(uint256).max, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.stopPrank();
    }

    // ------------------------------------------------------ accept/revision

    function test_BuyerAccept_SettlesWorkerAward() public {
        uint256 id = _funded();
        _submit0(id);
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.DeliverableAccepted(id, 0, AMOUNT0);
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        assertEq(escrow.balances(worker), AMOUNT0);
        assertEq(escrow.balances(buyer), 0);
        assertEq(address(escrow).balance, _total());
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.Settled));
    }

    function test_RevertWhen_NonBuyerAcceptsDeliverable() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotTaskBuyer.selector));
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
    }

    function test_BuyerAccept_AtExactDeadline() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0);
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        assertEq(escrow.balances(worker), AMOUNT0);
    }

    function test_RevertWhen_BuyerAccept_AfterDeadline() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0 + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.ReviewWindowExpired.selector));
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
    }

    function test_RevertWhen_AcceptDeliverableTwice() public {
        uint256 id = _funded();
        _submit0(id);
        vm.startPrank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableNotInReview.selector));
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.stopPrank();
        assertEq(escrow.balances(worker), AMOUNT0);
    }

    function test_RevisionFlow_ResubmitsNewRound() public {
        uint256 id = _funded();
        _submit0(id);
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.RevisionRequested(id, 0, 1);
        vm.prank(buyer);
        escrow.requestRevision(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.AwaitingSubmission));

        vm.warp(2 days);
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.SubmissionRecorded(id, 0, 2);
        vm.prank(worker);
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        (,,,,, uint64 submittedAt,,,,) = escrow.getDeliverable(id, 0);
        assertEq(submittedAt, 2 days);

        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 2, keccak256("fixture-artifact"), submittedAt);
        assertEq(escrow.balances(worker), AMOUNT0);
    }

    function test_RevertWhen_RevisionLimitReached() public {
        uint256 id = _funded();
        _submit0(id);
        vm.startPrank(buyer);
        escrow.requestRevision(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.stopPrank();
        vm.prank(worker);
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.RevisionLimitReached.selector));
        escrow.requestRevision(id, 0, 2, keccak256("fixture-artifact"), uint64(T_SUBMIT));
    }

    function test_RevertWhen_RevisionAfterDeadline() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0 + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.ReviewWindowExpired.selector));
        escrow.requestRevision(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
    }

    // -------------------------------------------------------------- dispute

    function test_OpenDispute_ByEitherParticipant() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.Disputed));
    }

    function test_RevertWhen_OutsiderOpensDispute() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotParticipant.selector));
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
    }

    function test_RevertWhen_DisputeAfterDeadline() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0 + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.ReviewWindowExpired.selector));
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
    }

    function test_PrimaryResolve_SplitsAllocation() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        uint128 workerAmount = AMOUNT0 / 4;
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0, workerAmount);
        assertEq(escrow.balances(worker), workerAmount);
        assertEq(escrow.balances(buyer), AMOUNT0 - workerAmount);
        assertEq(address(escrow).balance, _total());
    }

    function test_PrimaryResolve_AtExactWindowBoundary() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW());
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0, AMOUNT0);
        assertEq(escrow.balances(worker), AMOUNT0);
    }

    function test_RevertWhen_PrimaryResolve_AfterWindow() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.ArbiterWindowElapsed.selector));
        escrow.resolveDispute(id, 0, AMOUNT0);
    }

    function test_RevertWhen_NonArbiterResolves() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.prank(backup);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotPrimaryArbiter.selector));
        escrow.resolveDispute(id, 0, AMOUNT0);
    }

    function test_RevertWhen_AwardExceedsAllocation() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.AwardExceedsAllocation.selector));
        escrow.resolveDispute(id, 0, AMOUNT0 + 1);
    }

    function test_Handover_AtExactWindow_RevertsThenSucceeds() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW());
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.PrimaryWindowNotElapsed.selector));
        escrow.handoverDispute(id, 0);
        vm.warp(block.timestamp + 1);
        vm.prank(outsider);
        escrow.handoverDispute(id, 0);
        (,,,,,,, uint64 handoverAt,,) = escrow.getDeliverable(id, 0);
        assertEq(handoverAt, block.timestamp);
    }

    function test_RevertWhen_HandoverTwice() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
        vm.prank(outsider);
        escrow.handoverDispute(id, 0);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DisputeAlreadyHandedOver.selector));
        escrow.handoverDispute(id, 0);
    }

    function test_BackupResolve_WithinWindow() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
        vm.prank(outsider);
        escrow.handoverDispute(id, 0);
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW());
        vm.prank(backup);
        escrow.resolveDispute(id, 0, 0);
        assertEq(escrow.balances(buyer), AMOUNT0);
        assertEq(escrow.balances(worker), 0);
    }

    function test_RevertWhen_BackupResolve_AfterWindow_Locked() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
        vm.prank(outsider);
        escrow.handoverDispute(id, 0);
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
        vm.prank(backup);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.BackupWindowElapsed.selector));
        escrow.resolveDispute(id, 0, AMOUNT0);
    }

    function test_RevertWhen_PrimaryResolves_AfterHandover() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(block.timestamp + escrow.ARBITER_WINDOW() + 1);
        vm.prank(outsider);
        escrow.handoverDispute(id, 0);
        vm.prank(arbiter);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotBackupArbiter.selector));
        escrow.resolveDispute(id, 0, AMOUNT0);
    }

    function test_DisputeBlocksBuyerAcceptAndTimeoutClaim() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(worker);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableNotInReview.selector));
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.stopPrank();
        vm.warp(DEADLINE0 + 1);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableNotInReview.selector));
        escrow.claimTimeout(id, 0);
        assertEq(escrow.balances(worker), 0);
    }

    // -------------------------------------------------------------- timeout

    function test_Timeout_PaysWorkerAfterBuyerSilence() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0 + 1);
        vm.expectEmit(true, true, true, true);
        emit PactraEscrow.TimeoutClaimed(id, 0, AMOUNT0);
        vm.prank(worker);
        escrow.claimTimeout(id, 0);
        assertEq(escrow.balances(worker), AMOUNT0);
    }

    function test_Timeout_AtExactDeadline_Reverts() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.ReviewWindowOpen.selector));
        escrow.claimTimeout(id, 0);
    }

    function test_RevertWhen_NonWorkerClaimsTimeout() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0 + 1);
        vm.prank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotTaskWorker.selector));
        escrow.claimTimeout(id, 0);
    }

    function test_RevertWhen_ClaimTimeoutTwice() public {
        uint256 id = _funded();
        _submit0(id);
        vm.warp(DEADLINE0 + 1);
        vm.startPrank(worker);
        escrow.claimTimeout(id, 0);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableNotInReview.selector));
        escrow.claimTimeout(id, 0);
        vm.stopPrank();
        assertEq(escrow.balances(worker), AMOUNT0);
    }

    // --------------------------------------------------- completion & locks

    function test_TaskCompletes_WhenAllDeliverablesSettled() public {
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.warp(T_SUBMIT);
        vm.prank(worker);
        escrow.submitDeliverable(id, 1, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.warp(T_SUBMIT + WINDOW1 + 1);
        vm.prank(worker);
        escrow.claimTimeout(id, 1);
        (,,,,,, PactraEscrow.TaskStatus status,, uint256 settled) = escrow.getTask(id);
        assertEq(uint8(status), uint8(PactraEscrow.TaskStatus.Completed));
        assertEq(settled, 2);
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.TaskNotFunded.selector));
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
    }

    function test_NoSubmission_LeavesFundsLocked_BeforeDeliveryDeadline() public {
        uint256 id = _funded();
        vm.startPrank(buyer);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableNotInReview.selector));
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.stopPrank();
        vm.prank(worker);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.DeliverableNotInReview.selector));
        escrow.claimTimeout(id, 0);
        assertEq(address(escrow).balance, _total());
    }

    // -------------------------------------------------- replay & fuzz

    function test_ReplayAcrossTasks_OtherWorkerRejected() public {
        uint256 id = _funded();
        vm.prank(buyer);
        uint256 id2 = escrow.createTask(
            outsider, arbiter, backup, block.chainid, 2, keccak256("pactra-test-manifest"), _configs()
        );
        vm.prank(outsider);
        escrow.acceptTask(id2);
        vm.deal(buyer, _total());
        vm.prank(buyer);
        escrow.fundTask{value: _total()}(id2);
        vm.warp(T_SUBMIT);
        vm.prank(outsider);
        escrow.submitDeliverable(id2, 0, keccak256("fixture-artifact"), type(uint64).max, hex"f1");
        vm.warp(T_SUBMIT + WINDOW0 + 1);
        vm.prank(outsider);
        vm.expectRevert(abi.encodeWithSelector(PactraEscrow.NotTaskWorker.selector));
        escrow.claimTimeout(id, 0);
        assertEq(escrow.balances(outsider), 0);
        assertEq(escrow.balances(worker), 0);
    }

    function testFuzz_ManifestDigest_BindsChainVersionContent(
        uint256 chainA,
        uint256 chainB,
        uint64 versionA,
        uint64 versionB,
        bytes32 contentA,
        bytes32 contentB
    ) public view {
        vm.assume(chainA != chainB || versionA != versionB || contentA != contentB);
        bytes32 digestA = escrow.manifestDigest(buyer, worker, arbiter, backup, chainA, versionA, contentA, _configs());
        bytes32 digestB = escrow.manifestDigest(buyer, worker, arbiter, backup, chainB, versionB, contentB, _configs());
        assertTrue(digestA != digestB);
    }

    function testFuzz_ResolveDispute_ConservesValue(uint128 workerAmount) public {
        workerAmount = uint128(bound(uint256(workerAmount), 0, AMOUNT0));
        uint256 id = _funded();
        _submit0(id);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, keccak256("fixture-artifact"), uint64(T_SUBMIT));
        vm.prank(arbiter);
        escrow.resolveDispute(id, 0, workerAmount);
        (,,,,,,,, uint128 award, uint128 refund) = escrow.getDeliverable(id, 0);
        assertEq(uint256(award) + uint256(refund), AMOUNT0);
        assertEq(escrow.balances(worker), workerAmount);
        assertEq(escrow.balances(buyer), AMOUNT0 - workerAmount);
        assertEq(address(escrow).balance, _total());
    }
}
