// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";

/// @dev Adversarial handler for the invariant fuzzer. Every action checks
///      current eligibility before calling, mirroring the contract's own
///      guards, and updates ghost accounting on success. Any unexpected
///      revert fails the run.
contract EscrowHandler {
    Vm private constant vm = Vm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);

    PactraEscrow public immutable escrow;
    uint256 public immutable taskId;
    address public immutable buyer;
    address public immutable worker;
    address public immutable arbiter;
    address public immutable backup;

    uint256 public ghostDeposited;
    uint256 public ghostWithdrawn;
    uint256 public ghostWorkerAwards;
    uint256 public ghostBuyerRefunds;

    uint128[3] internal amounts;
    uint64[3] internal windows;
    uint16[3] internal limits;
    uint256 private constant TOTAL = 6e15;
    uint256 private constant ACTOR_COUNT = 4;

    struct Snapshot {
        PactraEscrow.DeliverableStatus status;
        uint16 revisionsUsed;
        uint64 submittedAt;
        uint64 disputeOpenedAt;
        uint64 handoverAt;
    }

    constructor(
        PactraEscrow escrow_,
        uint256 taskId_,
        address buyer_,
        address worker_,
        address arbiter_,
        address backup_,
        uint128[3] memory amounts_,
        uint64[3] memory windows_,
        uint16[3] memory limits_
    ) {
        escrow = escrow_;
        taskId = taskId_;
        buyer = buyer_;
        worker = worker_;
        arbiter = arbiter_;
        backup = backup_;
        amounts = amounts_;
        windows = windows_;
        limits = limits_;
    }

    function _bound(uint256 x, uint256 min, uint256 max) internal pure returns (uint256) {
        return min + (x % (max - min + 1));
    }

    function _warp(uint256 seed) internal {
        vm.warp(block.timestamp + _bound(seed, 0, 2 days));
    }

    function _snapshot(uint256 index) internal view returns (Snapshot memory s) {
        (
            ,,,
            PactraEscrow.DeliverableStatus status,
            uint16 revisionsUsed,
            uint64 submittedAt,
            uint64 disputeOpenedAt,
            uint64 handoverAt,,
        ) = escrow.getDeliverable(taskId, index);
        s = Snapshot({
            status: status,
            revisionsUsed: revisionsUsed,
            submittedAt: submittedAt,
            disputeOpenedAt: disputeOpenedAt,
            handoverAt: handoverAt
        });
    }

    function _taskStatus() internal view returns (PactraEscrow.TaskStatus) {
        (,,,,,, PactraEscrow.TaskStatus status,,) = escrow.getTask(taskId);
        return status;
    }

    function _windowOpen(Snapshot memory s, uint256 index) internal view returns (bool) {
        return block.timestamp <= uint256(s.submittedAt) + uint256(windows[index]);
    }

    function fundTask(uint256 seed) external {
        _warp(seed);
        if (_taskStatus() != PactraEscrow.TaskStatus.AcceptedUnfunded) return;
        vm.deal(buyer, address(buyer).balance + TOTAL);
        vm.prank(buyer);
        escrow.fundTask{value: TOTAL}(taskId);
        ghostDeposited += TOTAL;
    }

    function submitDeliverable(uint256 seed) external {
        _warp(seed);
        uint256 index = seed % 3;
        if (_taskStatus() != PactraEscrow.TaskStatus.Funded) return;
        Snapshot memory s = _snapshot(index);
        if (s.status != PactraEscrow.DeliverableStatus.AwaitingSubmission) return;
        vm.prank(worker);
        escrow.submitDeliverable(taskId, index);
    }

    function acceptDeliverable(uint256 seed) external {
        _warp(seed);
        uint256 index = seed % 3;
        if (_taskStatus() != PactraEscrow.TaskStatus.Funded) return;
        Snapshot memory s = _snapshot(index);
        if (s.status != PactraEscrow.DeliverableStatus.InReview || !_windowOpen(s, index)) return;
        vm.prank(buyer);
        escrow.acceptDeliverable(taskId, index);
        ghostWorkerAwards += amounts[index];
    }

    function requestRevision(uint256 seed) external {
        _warp(seed);
        uint256 index = seed % 3;
        if (_taskStatus() != PactraEscrow.TaskStatus.Funded) return;
        Snapshot memory s = _snapshot(index);
        if (s.status != PactraEscrow.DeliverableStatus.InReview || !_windowOpen(s, index)) return;
        if (s.revisionsUsed >= limits[index]) return;
        vm.prank(buyer);
        escrow.requestRevision(taskId, index);
    }

    function openDispute(uint256 seed) external {
        _warp(seed);
        uint256 index = seed % 3;
        if (_taskStatus() != PactraEscrow.TaskStatus.Funded) return;
        Snapshot memory s = _snapshot(index);
        if (s.status != PactraEscrow.DeliverableStatus.InReview || !_windowOpen(s, index)) return;
        vm.prank(seed % 2 == 0 ? buyer : worker);
        escrow.openDispute(taskId, index);
    }

    function handoverDispute(uint256 seed) external {
        _warp(seed);
        uint256 index = seed % 3;
        if (_taskStatus() != PactraEscrow.TaskStatus.Funded) return;
        Snapshot memory s = _snapshot(index);
        if (s.status != PactraEscrow.DeliverableStatus.Disputed || s.handoverAt != 0) return;
        if (block.timestamp <= uint256(s.disputeOpenedAt) + escrow.ARBITER_WINDOW()) return;
        escrow.handoverDispute(taskId, index);
    }

    function resolveDispute(uint256 seed) external {
        _warp(seed);
        uint256 index = seed % 3;
        if (_taskStatus() != PactraEscrow.TaskStatus.Funded) return;
        Snapshot memory s = _snapshot(index);
        if (s.status != PactraEscrow.DeliverableStatus.Disputed) return;
        address resolver;
        if (s.handoverAt == 0) {
            if (block.timestamp > uint256(s.disputeOpenedAt) + escrow.ARBITER_WINDOW()) return;
            resolver = arbiter;
        } else {
            if (block.timestamp > uint256(s.handoverAt) + escrow.ARBITER_WINDOW()) return;
            resolver = backup;
        }
        uint128 workerAmount = uint128(_bound(seed / 3, 0, amounts[index]));
        vm.prank(resolver);
        escrow.resolveDispute(taskId, index, workerAmount);
        ghostWorkerAwards += workerAmount;
        ghostBuyerRefunds += amounts[index] - workerAmount;
    }

    function claimTimeout(uint256 seed) external {
        _warp(seed);
        uint256 index = seed % 3;
        if (_taskStatus() != PactraEscrow.TaskStatus.Funded) return;
        Snapshot memory s = _snapshot(index);
        if (s.status != PactraEscrow.DeliverableStatus.InReview) return;
        if (block.timestamp <= uint256(s.submittedAt) + uint256(windows[index])) return;
        vm.prank(worker);
        escrow.claimTimeout(taskId, index);
        ghostWorkerAwards += amounts[index];
    }

    function withdraw(uint256 seed) external {
        _warp(seed);
        address actor = [buyer, worker, arbiter, backup][seed % ACTOR_COUNT];
        uint256 due = escrow.balances(actor);
        if (due == 0) return;
        vm.prank(actor);
        escrow.withdraw();
        ghostWithdrawn += due;
    }
}

contract PactraEscrowInvariants is Test {
    PactraEscrow internal escrow;
    EscrowHandler internal handler;
    address internal buyer = makeAddr("inv-buyer");
    address internal worker = makeAddr("inv-worker");
    address internal arbiter = makeAddr("inv-arbiter");
    address internal backup = makeAddr("inv-backup");
    uint256 internal taskId;

    uint128[3] internal amounts = [uint128(1e15), uint128(2e15), uint128(3e15)];
    uint64[3] internal windows = [uint64(1 days), uint64(2 days), uint64(3 days)];
    uint16[3] internal limits = [uint16(1), uint16(0), uint16(2)];

    function setUp() public {
        escrow = new PactraEscrow();
        bytes32 manifest = escrow.manifestDigest(block.chainid, 1, keccak256("invariant-manifest"));
        PactraEscrow.DeliverableConfig[] memory configs = new PactraEscrow.DeliverableConfig[](3);
        for (uint256 i; i < 3; ++i) {
            configs[i] = PactraEscrow.DeliverableConfig({
                amount: amounts[i], revisionLimit: limits[i], reviewWindow: windows[i]
            });
        }
        vm.prank(buyer);
        taskId = escrow.createTask(worker, arbiter, backup, manifest, configs);
        vm.prank(worker);
        escrow.acceptTask(taskId);

        handler = new EscrowHandler(escrow, taskId, buyer, worker, arbiter, backup, amounts, windows, limits);
        targetContract(address(handler));
        bytes4[] memory selectors = new bytes4[](9);
        selectors[0] = handler.fundTask.selector;
        selectors[1] = handler.submitDeliverable.selector;
        selectors[2] = handler.acceptDeliverable.selector;
        selectors[3] = handler.requestRevision.selector;
        selectors[4] = handler.openDispute.selector;
        selectors[5] = handler.handoverDispute.selector;
        selectors[6] = handler.resolveDispute.selector;
        selectors[7] = handler.claimTimeout.selector;
        selectors[8] = handler.withdraw.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_EthConserved() public view {
        assertEq(
            address(escrow).balance,
            handler.ghostDeposited() - handler.ghostWithdrawn(),
            "escrow balance must equal deposits minus withdrawals"
        );
    }

    function invariant_BalancesMatchSettlementGhosts() public view {
        uint256 sum = escrow.balances(buyer) + escrow.balances(worker);
        assertEq(
            sum,
            handler.ghostWorkerAwards() + handler.ghostBuyerRefunds() - handler.ghostWithdrawn(),
            "party balances must match settled awards minus withdrawals"
        );
    }

    function invariant_SettledSplitsMatchAllocation() public view {
        for (uint256 i; i < 3; ++i) {
            (uint128 amount,,, PactraEscrow.DeliverableStatus status,,,,, uint128 workerAward, uint128 buyerRefund) =
                escrow.getDeliverable(taskId, i);
            if (status == PactraEscrow.DeliverableStatus.Settled) {
                assertEq(uint256(workerAward) + uint256(buyerRefund), amount, "settled split must equal allocation");
            } else {
                assertEq(uint256(workerAward), 0, "unsettled deliverable must not award");
                assertEq(uint256(buyerRefund), 0, "unsettled deliverable must not refund");
            }
        }
    }

    function invariant_TaskStatusConsistentWithSettlements() public view {
        uint256 settled;
        for (uint256 i; i < 3; ++i) {
            (,,, PactraEscrow.DeliverableStatus status,,,,,,) = escrow.getDeliverable(taskId, i);
            if (status == PactraEscrow.DeliverableStatus.Settled) settled += 1;
        }
        (,,,,,, PactraEscrow.TaskStatus taskStatus,,) = escrow.getTask(taskId);
        if (settled == 3) {
            assertEq(uint8(taskStatus), uint8(PactraEscrow.TaskStatus.Completed), "all settled implies completed");
        } else {
            assertTrue(uint8(taskStatus) != uint8(PactraEscrow.TaskStatus.Completed), "completed implies all settled");
        }
    }
}
