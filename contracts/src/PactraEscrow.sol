// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

/// @title Pactra escrow for small localization jobs.
/// @notice Source-only implementation of the owner-approved settlement
///         decisions recorded in docs/SETTLEMENT_DECISIONS.md. Native
///         currency only, one designated worker per task, per-deliverable
///         allocations, pull-based withdrawals, no admin functions.
/// @dev Explicitly NOT implemented because the policy is unresolved (funds
///      stay locked rather than guessing): post-funding cancellation, a
///         buyer exit when nothing was submitted, an exit when the backup
///         arbiter also misses the deadline, fees, worker reassignment and
///         dependency-linked deliverables. Deployment requires the release
///         gate in docs/SETTLEMENT_DECISIONS.md; this contract is not
///         deployed and not independently reviewed.
contract PactraEscrow {
    // ------------------------------------------------------------------ //
    //                             constants                              //
    // ------------------------------------------------------------------ //

    /// @notice Owner-approved primary and backup arbiter decision windows.
    uint256 public constant ARBITER_WINDOW = 48 hours;
    uint256 public constant MAX_DELIVERABLES = 50;

    // ------------------------------------------------------------------ //
    //                              errors                                //
    // ------------------------------------------------------------------ //

    error InvalidParties();
    error InvalidManifest();
    error ManifestAlreadyBound();
    error InvalidDeliverables();
    error DeliverableOutOfRange();
    error NotTaskBuyer();
    error NotTaskWorker();
    error NotParticipant();
    error NotPrimaryArbiter();
    error NotBackupArbiter();
    error TaskNotAwaitingWorker();
    error TaskNotAcceptedUnfunded();
    error TaskNotFunded();
    error WrongFundingAmount();
    error DeliverableNotAwaitingSubmission();
    error DeliverableNotInReview();
    error DeliverableNotDisputed();
    error ReviewWindowOpen();
    error ReviewWindowExpired();
    error RevisionLimitReached();
    error PrimaryWindowNotElapsed();
    error DisputeAlreadyHandedOver();
    error ArbiterWindowElapsed();
    error BackupWindowElapsed();
    error AwardExceedsAllocation();
    error NothingToWithdraw();
    error WithdrawalFailed();

    // ------------------------------------------------------------------ //
    //                              events                                //
    // ------------------------------------------------------------------ //

    event TaskCreated(
        uint256 indexed taskId,
        address indexed buyer,
        address worker,
        address arbiter,
        address backupArbiter,
        bytes32 manifestHash,
        uint256 chainId,
        uint256 deliverableCount
    );
    event DeliverableConfigured(
        uint256 indexed taskId, uint256 indexed index, uint128 amount, uint16 revisionLimit, uint64 reviewWindow
    );
    event WorkerAccepted(uint256 indexed taskId, address indexed worker);
    event TaskFunded(uint256 indexed taskId, uint256 amount);
    event SubmissionRecorded(uint256 indexed taskId, uint256 indexed index, uint256 round);
    event DeliverableAccepted(uint256 indexed taskId, uint256 indexed index, uint128 amount);
    event RevisionRequested(uint256 indexed taskId, uint256 indexed index, uint256 round);
    event DisputeOpened(uint256 indexed taskId, uint256 indexed index, address indexed opener, uint64 openedAt);
    event DisputeHandover(uint256 indexed taskId, uint256 indexed index, uint64 handedOverAt);
    event DisputeResolved(
        uint256 indexed taskId,
        uint256 indexed index,
        address indexed resolver,
        uint128 workerAmount,
        uint128 buyerRefund
    );
    event TimeoutClaimed(uint256 indexed taskId, uint256 indexed index, uint128 amount);
    event TaskCompleted(uint256 indexed taskId);
    event WithdrawalExecuted(address indexed to, uint256 amount);

    // ------------------------------------------------------------------ //
    //                              types                                 //
    // ------------------------------------------------------------------ //

    enum TaskStatus {
        AwaitingWorker,
        AcceptedUnfunded,
        Funded,
        Completed
    }

    enum DeliverableStatus {
        AwaitingSubmission,
        InReview,
        Disputed,
        Settled
    }

    struct DeliverableConfig {
        uint128 amount;
        uint16 revisionLimit;
        uint64 reviewWindow;
    }

    struct Deliverable {
        // Agreed before funding; immutable once the task is created.
        uint128 amount;
        uint16 revisionLimit;
        uint64 reviewWindow;
        // Lifecycle state.
        DeliverableStatus status;
        uint16 revisionsUsed;
        uint64 submittedAt;
        uint64 disputeOpenedAt;
        uint64 handoverAt;
        uint128 workerAward;
        uint128 buyerRefund;
    }

    struct Task {
        address buyer;
        address worker;
        address arbiter;
        address backupArbiter;
        bytes32 manifestHash;
        uint256 chainId;
        TaskStatus status;
        uint256 deliverableCount;
        uint256 settledCount;
    }

    // ------------------------------------------------------------------ //
    //                             storage                                //
    // ------------------------------------------------------------------ //

    uint256 public taskCount;
    mapping(uint256 => Task) private tasks;
    mapping(uint256 => mapping(uint256 => Deliverable)) private deliverables;
    mapping(bytes32 => bool) public boundManifests;
    mapping(address => uint256) public balances;

    // ------------------------------------------------------------------ //
    //                       manifest identity                            //
    // ------------------------------------------------------------------ //

    /// @notice Binds manifest content to a chain and version so the same
    ///         agreement cannot be replayed across chains or versions.
    function manifestDigest(uint256 chainId, uint64 version, bytes32 contentHash) public pure returns (bytes32) {
        return keccak256(abi.encodePacked("pactra-manifest-v1", chainId, version, contentHash));
    }

    // ------------------------------------------------------------------ //
    //                            lifecycle                               //
    // ------------------------------------------------------------------ //

    /// @notice Buyer records the task terms. The worker must accept before
    ///         funding; both arbiters are designated here and accepted by
    ///         the worker through acceptTask.
    function createTask(
        address worker,
        address arbiter,
        address backupArbiter,
        bytes32 manifestHash,
        DeliverableConfig[] calldata configs
    ) external returns (uint256 taskId) {
        address buyer = msg.sender;
        if (
            worker == address(0) || arbiter == address(0) || backupArbiter == address(0) || worker == buyer
                || arbiter == buyer || arbiter == worker || backupArbiter == buyer || backupArbiter == worker
                || arbiter == backupArbiter
        ) revert InvalidParties();
        if (manifestHash == bytes32(0)) revert InvalidManifest();
        if (boundManifests[manifestHash]) revert ManifestAlreadyBound();
        uint256 count = configs.length;
        if (count == 0 || count > MAX_DELIVERABLES) revert InvalidDeliverables();
        for (uint256 i; i < count; ++i) {
            if (configs[i].amount == 0 || configs[i].reviewWindow == 0) revert InvalidDeliverables();
        }

        taskId = ++taskCount;
        Task storage t = tasks[taskId];
        t.buyer = buyer;
        t.worker = worker;
        t.arbiter = arbiter;
        t.backupArbiter = backupArbiter;
        t.manifestHash = manifestHash;
        t.chainId = block.chainid;
        t.status = TaskStatus.AwaitingWorker;
        t.deliverableCount = count;
        boundManifests[manifestHash] = true;

        for (uint256 i; i < count; ++i) {
            Deliverable storage d = deliverables[taskId][i];
            d.amount = configs[i].amount;
            d.revisionLimit = configs[i].revisionLimit;
            d.reviewWindow = configs[i].reviewWindow;
            d.status = DeliverableStatus.AwaitingSubmission;
            emit DeliverableConfigured(taskId, i, configs[i].amount, configs[i].revisionLimit, configs[i].reviewWindow);
        }
        emit TaskCreated(taskId, buyer, worker, arbiter, backupArbiter, manifestHash, block.chainid, count);
    }

    /// @notice Designated worker accepts the scope, allocations, revision
    ///         limits, review windows and both arbiters. Ends at
    ///         accepted_unfunded; no funds move here.
    function acceptTask(uint256 taskId) external {
        Task storage t = tasks[taskId];
        if (msg.sender != t.worker) revert NotTaskWorker();
        if (t.status != TaskStatus.AwaitingWorker) revert TaskNotAwaitingWorker();
        t.status = TaskStatus.AcceptedUnfunded;
        emit WorkerAccepted(taskId, msg.sender);
    }

    /// @notice Buyer funds the entire task upfront with the exact total
    ///         allocation after the worker has accepted.
    function fundTask(uint256 taskId) external payable {
        Task storage t = tasks[taskId];
        if (msg.sender != t.buyer) revert NotTaskBuyer();
        if (t.status != TaskStatus.AcceptedUnfunded) revert TaskNotAcceptedUnfunded();
        uint256 total = totalAllocation(taskId);
        if (msg.value != total) revert WrongFundingAmount();
        t.status = TaskStatus.Funded;
        emit TaskFunded(taskId, msg.value);
    }

    /// @notice Worker records a submission for a deliverable round. Only a
    ///         time anchor is stored on-chain; artifact availability stays
    ///         an off-chain backend concern.
    function submitDeliverable(uint256 taskId, uint256 index) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.worker) revert NotTaskWorker();
        if (d.status != DeliverableStatus.AwaitingSubmission) revert DeliverableNotAwaitingSubmission();
        d.status = DeliverableStatus.InReview;
        d.submittedAt = uint64(block.timestamp);
        emit SubmissionRecorded(taskId, index, uint256(d.revisionsUsed) + 1);
    }

    /// @notice Buyer accepts one deliverable while its review window is
    ///         open. The allocation becomes withdrawable by the worker.
    function acceptDeliverable(uint256 taskId, uint256 index) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.buyer) revert NotTaskBuyer();
        if (d.status != DeliverableStatus.InReview) revert DeliverableNotInReview();
        if (block.timestamp > uint256(d.submittedAt) + uint256(d.reviewWindow)) revert ReviewWindowExpired();
        _settle(t, d, taskId, d.amount, 0);
        emit DeliverableAccepted(taskId, index, d.amount);
    }

    /// @notice Buyer requests one revision while the review window is open
    ///         and the agreed revision limit has not been exhausted.
    function requestRevision(uint256 taskId, uint256 index) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.buyer) revert NotTaskBuyer();
        if (d.status != DeliverableStatus.InReview) revert DeliverableNotInReview();
        if (block.timestamp > uint256(d.submittedAt) + uint256(d.reviewWindow)) revert ReviewWindowExpired();
        if (d.revisionsUsed >= d.revisionLimit) revert RevisionLimitReached();
        d.revisionsUsed += 1;
        d.status = DeliverableStatus.AwaitingSubmission;
        d.submittedAt = 0;
        emit RevisionRequested(taskId, index, d.revisionsUsed);
    }

    /// @notice Either party opens a dispute for a deliverable while its
    ///         review window is open. An active dispute blocks the timeout
    ///         payout for that allocation.
    function openDispute(uint256 taskId, uint256 index) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.buyer && msg.sender != t.worker) revert NotParticipant();
        if (d.status != DeliverableStatus.InReview) revert DeliverableNotInReview();
        if (block.timestamp > uint256(d.submittedAt) + uint256(d.reviewWindow)) revert ReviewWindowExpired();
        d.status = DeliverableStatus.Disputed;
        d.disputeOpenedAt = uint64(block.timestamp);
        emit DisputeOpened(taskId, index, msg.sender, uint64(block.timestamp));
    }

    /// @notice Permissionless transition to the backup arbiter once the
    ///         primary's 48-hour window has elapsed. Recording the handover
    ///         revokes the primary's decision authority for this dispute.
    function handoverDispute(uint256 taskId, uint256 index) external {
        (, Deliverable storage d) = _deliverable(taskId, index);
        if (d.status != DeliverableStatus.Disputed) revert DeliverableNotDisputed();
        if (d.handoverAt != 0) revert DisputeAlreadyHandedOver();
        if (block.timestamp <= uint256(d.disputeOpenedAt) + ARBITER_WINDOW) revert PrimaryWindowNotElapsed();
        d.handoverAt = uint64(block.timestamp);
        emit DisputeHandover(taskId, index, d.handoverAt);
    }

    /// @notice Primary arbiter resolves within its window, or the backup
    ///         arbiter resolves within its window after a recorded handover.
    ///         Authority is limited to splitting this allocation between the
    ///         parties; the arbiter is never paid. If the backup window also
    ///         elapses, the allocation stays locked (unresolved policy).
    function resolveDispute(uint256 taskId, uint256 index, uint128 workerAmount) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (d.status != DeliverableStatus.Disputed) revert DeliverableNotDisputed();
        if (workerAmount > d.amount) revert AwardExceedsAllocation();
        if (d.handoverAt == 0) {
            if (msg.sender != t.arbiter) revert NotPrimaryArbiter();
            if (block.timestamp > uint256(d.disputeOpenedAt) + ARBITER_WINDOW) revert ArbiterWindowElapsed();
        } else {
            if (msg.sender != t.backupArbiter) revert NotBackupArbiter();
            if (block.timestamp > uint256(d.handoverAt) + ARBITER_WINDOW) revert BackupWindowElapsed();
        }
        uint128 buyerAmount = d.amount - workerAmount;
        _settle(t, d, taskId, workerAmount, buyerAmount);
        emit DisputeResolved(taskId, index, msg.sender, workerAmount, buyerAmount);
    }

    /// @notice Worker claims the timeout payout after the buyer stayed
    ///         silent past the review deadline. The contract does not
    ///         execute itself; the worker submits this transaction.
    function claimTimeout(uint256 taskId, uint256 index) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.worker) revert NotTaskWorker();
        if (d.status != DeliverableStatus.InReview) revert DeliverableNotInReview();
        if (block.timestamp <= uint256(d.submittedAt) + uint256(d.reviewWindow)) revert ReviewWindowOpen();
        _settle(t, d, taskId, d.amount, 0);
        emit TimeoutClaimed(taskId, index, d.amount);
    }

    /// @notice Pull-based withdrawal of settled balances. A failing receiver
    ///         only reverts its own transaction; the balance is kept and the
    ///         withdrawal can be retried.
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        balances[msg.sender] = 0;
        emit WithdrawalExecuted(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert WithdrawalFailed();
    }

    // ------------------------------------------------------------------ //
    //                              views                                 //
    // ------------------------------------------------------------------ //

    function getTask(uint256 taskId)
        external
        view
        returns (
            address buyer,
            address worker,
            address arbiter,
            address backupArbiter,
            bytes32 manifestHash,
            uint256 chainId,
            TaskStatus status,
            uint256 deliverableCount,
            uint256 settledCount
        )
    {
        Task storage t = tasks[taskId];
        return (
            t.buyer,
            t.worker,
            t.arbiter,
            t.backupArbiter,
            t.manifestHash,
            t.chainId,
            t.status,
            t.deliverableCount,
            t.settledCount
        );
    }

    function getDeliverable(uint256 taskId, uint256 index)
        external
        view
        returns (
            uint128 amount,
            uint16 revisionLimit,
            uint64 reviewWindow,
            DeliverableStatus status,
            uint16 revisionsUsed,
            uint64 submittedAt,
            uint64 disputeOpenedAt,
            uint64 handoverAt,
            uint128 workerAward,
            uint128 buyerRefund
        )
    {
        Deliverable storage d = deliverables[taskId][index];
        return (
            d.amount,
            d.revisionLimit,
            d.reviewWindow,
            d.status,
            d.revisionsUsed,
            d.submittedAt,
            d.disputeOpenedAt,
            d.handoverAt,
            d.workerAward,
            d.buyerRefund
        );
    }

    function totalAllocation(uint256 taskId) public view returns (uint256 total) {
        Task storage t = tasks[taskId];
        for (uint256 i; i < t.deliverableCount; ++i) {
            total += deliverables[taskId][i].amount;
        }
    }

    // ------------------------------------------------------------------ //
    //                             internals                              //
    // ------------------------------------------------------------------ //

    function _deliverable(uint256 taskId, uint256 index) internal view returns (Task storage t, Deliverable storage d) {
        t = tasks[taskId];
        if (t.status != TaskStatus.Funded) revert TaskNotFunded();
        if (index >= t.deliverableCount) revert DeliverableOutOfRange();
        d = deliverables[taskId][index];
    }

    function _settle(Task storage t, Deliverable storage d, uint256 taskId, uint128 workerAmount, uint128 buyerAmount)
        private
    {
        d.status = DeliverableStatus.Settled;
        d.workerAward = workerAmount;
        d.buyerRefund = buyerAmount;
        if (workerAmount > 0) balances[t.worker] += workerAmount;
        if (buyerAmount > 0) balances[t.buyer] += buyerAmount;
        t.settledCount += 1;
        if (t.settledCount == t.deliverableCount) {
            t.status = TaskStatus.Completed;
            emit TaskCompleted(taskId);
        }
    }
}
