// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

/// @title Pactra escrow for small localization jobs.
/// @notice Source-only implementation of the owner-approved settlement
///         decisions recorded in docs/SETTLEMENT_DECISIONS.md. Native
///         currency only, one designated worker per task, per-deliverable
///         allocations, pull-based withdrawals, no admin functions.
/// @dev Source/local verification only, not authorization to hold funds.
///      Attestor signatures assert accessibility, not quality or on-chain storage.
contract PactraEscrow {
    // ------------------------------------------------------------------ //
    //                             constants                              //
    // ------------------------------------------------------------------ //

    /// @notice Owner-approved primary and backup arbiter decision windows.
    uint256 public constant ARBITER_WINDOW = 48 hours;
    uint256 public constant MAX_DELIVERABLES = 50;
    address public immutable evidenceAttestor;
    bytes32 public constant MANIFEST_TYPEHASH = keccak256(
        "Manifest(address buyer,address worker,address arbiter,address backupArbiter,address evidenceAttestor,uint256 arbiterWindow,uint256 maxDeliverables,uint256 chainId,uint64 version,bytes32 contentHash,bytes32 configsHash)"
    );
    bytes32 public constant SUBMISSION_TYPEHASH = keccak256(
        "Submission(uint256 taskId,uint256 index,uint256 round,bytes32 manifestHash,bytes32 artifactHash,uint64 expiry)"
    );
    bytes32 public constant SETTLEMENT_TYPEHASH = keccak256(
        "Settlement(uint256 taskId,uint256 index,bytes32 manifestHash,uint128 workerAmount,uint256 nonce,uint64 expiry)"
    );

    constructor(address evidenceAttestor_) {
        if (evidenceAttestor_ == address(0)) revert InvalidParties();
        evidenceAttestor = evidenceAttestor_;
    }

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
    error InvalidSignature();
    error SignatureExpired();
    error DeliveryDeadlineElapsed();
    error DeliveryDeadlineNotElapsed();
    error PreviouslySubmitted();
    error BackupWindowNotElapsed();

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
    event DeliveryDeadlineConfigured(uint256 indexed taskId, uint256 indexed index, uint64 deliveryDeadline);
    event EvidenceRecorded(
        uint256 indexed taskId, uint256 indexed index, uint256 round, bytes32 artifactHash, uint64 expiry
    );
    event UnsubmittedRefunded(uint256 indexed taskId, uint256 indexed index, uint128 amount);
    event AgreementSettled(
        uint256 indexed taskId, uint256 indexed index, uint128 workerAmount, uint128 buyerRefund, uint256 nonce
    );

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
        uint64 deliveryDeadline;
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
        uint64 deliveryDeadline;
        bool everSubmitted;
        bytes32 artifactHash;
        uint64 attestationExpiry;
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
        uint64 version;
        bytes32 contentHash;
    }

    // ------------------------------------------------------------------ //
    //                             storage                                //
    // ------------------------------------------------------------------ //

    uint256 public taskCount;
    mapping(uint256 => Task) private tasks;
    mapping(uint256 => mapping(uint256 => Deliverable)) private deliverables;
    mapping(bytes32 => bool) public boundManifests;
    mapping(address => uint256) public balances;
    mapping(uint256 => mapping(uint256 => uint256)) public settlementNonces;

    // ------------------------------------------------------------------ //
    //                       manifest identity                            //
    // ------------------------------------------------------------------ //

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PactraEscrow"),
                keccak256("2"),
                block.chainid,
                address(this)
            )
        );
    }

    function _typed(bytes32 structHash) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    /// @notice Ordered configs hash is keccak256(abi.encode(configs)), not packed encoding.
    function manifestDigest(
        address buyer,
        address worker,
        address arbiter,
        address backupArbiter,
        uint256 chainId,
        uint64 version,
        bytes32 contentHash,
        DeliverableConfig[] calldata configs
    ) public view returns (bytes32) {
        return _typed(
            keccak256(
                abi.encode(
                    MANIFEST_TYPEHASH,
                    buyer,
                    worker,
                    arbiter,
                    backupArbiter,
                    evidenceAttestor,
                    ARBITER_WINDOW,
                    MAX_DELIVERABLES,
                    chainId,
                    version,
                    contentHash,
                    keccak256(abi.encode(configs))
                )
            )
        );
    }

    function submissionDigest(uint256 taskId, uint256 index, uint256 round, bytes32 artifactHash, uint64 expiry)
        public
        view
        returns (bytes32)
    {
        return _typed(
            keccak256(
                abi.encode(SUBMISSION_TYPEHASH, taskId, index, round, tasks[taskId].manifestHash, artifactHash, expiry)
            )
        );
    }

    function settlementDigest(uint256 taskId, uint256 index, uint128 workerAmount, uint64 expiry)
        public
        view
        returns (bytes32)
    {
        return _typed(
            keccak256(
                abi.encode(
                    SETTLEMENT_TYPEHASH,
                    taskId,
                    index,
                    tasks[taskId].manifestHash,
                    workerAmount,
                    settlementNonces[taskId][index],
                    expiry
                )
            )
        );
    }

    /// @dev ERC-1271 uses STATICCALL; EOAs require canonical 65-byte low-s signatures.
    function _validSignature(address signer, bytes32 digest, bytes calldata signature) private view returns (bool) {
        if (signer.code.length != 0) {
            (bool ok, bytes memory result) =
                signer.staticcall(abi.encodeWithSelector(bytes4(0x1626ba7e), digest, signature));
            return ok && result.length >= 32 && abi.decode(result, (bytes32)) == bytes32(bytes4(0x1626ba7e));
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }
        if (uint256(s) > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 || (v != 27 && v != 28)) {
            return false;
        }
        return signer != address(0) && ecrecover(digest, v, r, s) == signer;
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
        uint256 chainId,
        uint64 version,
        bytes32 contentHash,
        DeliverableConfig[] calldata configs
    ) external returns (uint256 taskId) {
        address buyer = msg.sender;
        if (
            worker == address(0) || arbiter == address(0) || backupArbiter == address(0) || worker == buyer
                || arbiter == buyer || arbiter == worker || backupArbiter == buyer || backupArbiter == worker
                || arbiter == backupArbiter
        ) revert InvalidParties();
        if (chainId != block.chainid || version == 0 || contentHash == bytes32(0)) revert InvalidManifest();
        uint256 count = configs.length;
        if (count == 0 || count > MAX_DELIVERABLES) revert InvalidDeliverables();
        for (uint256 i; i < count; ++i) {
            if (
                configs[i].amount == 0 || configs[i].reviewWindow == 0 || configs[i].deliveryDeadline <= block.timestamp
            ) revert InvalidDeliverables();
        }
        bytes32 manifestHash =
            manifestDigest(buyer, worker, arbiter, backupArbiter, chainId, version, contentHash, configs);
        if (boundManifests[manifestHash]) revert ManifestAlreadyBound();

        taskId = ++taskCount;
        Task storage t = tasks[taskId];
        t.buyer = buyer;
        t.worker = worker;
        t.arbiter = arbiter;
        t.backupArbiter = backupArbiter;
        t.manifestHash = manifestHash;
        t.chainId = block.chainid;
        t.version = version;
        t.contentHash = contentHash;
        t.status = TaskStatus.AwaitingWorker;
        t.deliverableCount = count;
        boundManifests[manifestHash] = true;

        for (uint256 i; i < count; ++i) {
            Deliverable storage d = deliverables[taskId][i];
            d.amount = configs[i].amount;
            d.revisionLimit = configs[i].revisionLimit;
            d.reviewWindow = configs[i].reviewWindow;
            d.deliveryDeadline = configs[i].deliveryDeadline;
            emit DeliveryDeadlineConfigured(taskId, i, configs[i].deliveryDeadline);
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
        for (uint256 i; i < t.deliverableCount; ++i) {
            if (block.timestamp >= deliverables[taskId][i].deliveryDeadline) revert DeliveryDeadlineElapsed();
        }
        uint256 total = totalAllocation(taskId);
        if (msg.value != total) revert WrongFundingAmount();
        t.status = TaskStatus.Funded;
        emit TaskFunded(taskId, msg.value);
    }

    /// @notice Platform receipt asserts persisted artifact accessibility to buyer.
    ///         No buyer veto. Storage/retention and attestor honesty remain trusted.
    function submitDeliverable(
        uint256 taskId,
        uint256 index,
        bytes32 artifactHash,
        uint64 attestationExpiry,
        bytes calldata signature
    ) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.worker) revert NotTaskWorker();
        if (d.status != DeliverableStatus.AwaitingSubmission) revert DeliverableNotAwaitingSubmission();
        if (!d.everSubmitted && block.timestamp > d.deliveryDeadline) revert DeliveryDeadlineElapsed();
        if (block.timestamp > attestationExpiry) revert SignatureExpired();
        if (
            artifactHash == bytes32(0)
                || !_validSignature(
                    evidenceAttestor,
                    submissionDigest(taskId, index, uint256(d.revisionsUsed) + 1, artifactHash, attestationExpiry),
                    signature
                )
        ) revert InvalidSignature();
        d.everSubmitted = true;
        d.artifactHash = artifactHash;
        d.attestationExpiry = attestationExpiry;
        d.status = DeliverableStatus.InReview;
        d.submittedAt = uint64(block.timestamp);
        emit SubmissionRecorded(taskId, index, uint256(d.revisionsUsed) + 1);
        emit EvidenceRecorded(taskId, index, uint256(d.revisionsUsed) + 1, artifactHash, attestationExpiry);
    }

    /// @notice Buyer accepts one deliverable while its review window is
    ///         open. The allocation becomes withdrawable by the worker.
    function acceptDeliverable(
        uint256 taskId,
        uint256 index,
        uint256 expectedRound,
        bytes32 expectedArtifactHash,
        uint64 expectedSubmittedAt
    ) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.buyer) revert NotTaskBuyer();
        if (d.status != DeliverableStatus.InReview) revert DeliverableNotInReview();
        if (block.timestamp > uint256(d.submittedAt) + uint256(d.reviewWindow)) revert ReviewWindowExpired();
        _assertReviewEvidence(d, expectedRound, expectedArtifactHash, expectedSubmittedAt);
        _settle(t, d, taskId, d.amount, 0);
        emit DeliverableAccepted(taskId, index, d.amount);
    }

    /// @notice Buyer requests one revision while the review window is open
    ///         and the agreed revision limit has not been exhausted.
    function requestRevision(
        uint256 taskId,
        uint256 index,
        uint256 expectedRound,
        bytes32 expectedArtifactHash,
        uint64 expectedSubmittedAt
    ) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.buyer) revert NotTaskBuyer();
        if (d.status != DeliverableStatus.InReview) revert DeliverableNotInReview();
        if (block.timestamp > uint256(d.submittedAt) + uint256(d.reviewWindow)) revert ReviewWindowExpired();
        _assertReviewEvidence(d, expectedRound, expectedArtifactHash, expectedSubmittedAt);
        if (d.revisionsUsed >= d.revisionLimit) revert RevisionLimitReached();
        d.revisionsUsed += 1;
        d.status = DeliverableStatus.AwaitingSubmission;
        d.submittedAt = 0;
        emit RevisionRequested(taskId, index, d.revisionsUsed);
    }

    /// @notice Either party opens a dispute for a deliverable while its
    ///         review window is open. An active dispute blocks the timeout
    ///         payout for that allocation.
    function openDispute(
        uint256 taskId,
        uint256 index,
        uint256 expectedRound,
        bytes32 expectedArtifactHash,
        uint64 expectedSubmittedAt
    ) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.buyer && msg.sender != t.worker) revert NotParticipant();
        if (d.status != DeliverableStatus.InReview) revert DeliverableNotInReview();
        if (block.timestamp > uint256(d.submittedAt) + uint256(d.reviewWindow)) revert ReviewWindowExpired();
        _assertReviewEvidence(d, expectedRound, expectedArtifactHash, expectedSubmittedAt);
        d.status = DeliverableStatus.Disputed;
        d.disputeOpenedAt = uint64(block.timestamp);
        emit DisputeOpened(taskId, index, msg.sender, uint64(block.timestamp));
    }

    error ReviewEvidenceChanged();

    /// @dev Consent is a snapshot, not permission to act on whichever round mines next.
    ///      No external calls occur between this check and the guarded state mutation.
    function _assertReviewEvidence(
        Deliverable storage d,
        uint256 expectedRound,
        bytes32 expectedArtifactHash,
        uint64 expectedSubmittedAt
    ) private view {
        if (
            expectedRound != uint256(d.revisionsUsed) + 1 || expectedArtifactHash != d.artifactHash
                || expectedSubmittedAt != d.submittedAt
        ) revert ReviewEvidenceChanged();
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
    ///         elapses, only a bilateral signed agreement can settle it.
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

    function refundUnsubmitted(uint256 taskId, uint256 index) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (msg.sender != t.buyer) revert NotTaskBuyer();
        if (d.everSubmitted) revert PreviouslySubmitted();
        if (d.status != DeliverableStatus.AwaitingSubmission) revert DeliverableNotAwaitingSubmission();
        if (block.timestamp <= d.deliveryDeadline) revert DeliveryDeadlineNotElapsed();
        _settle(t, d, taskId, 0, d.amount);
        emit UnsubmittedRefunded(taskId, index, d.amount);
    }

    function settleByAgreement(
        uint256 taskId,
        uint256 index,
        uint128 workerAmount,
        uint64 expiry,
        bytes calldata buyerSignature,
        bytes calldata workerSignature
    ) external {
        (Task storage t, Deliverable storage d) = _deliverable(taskId, index);
        if (d.status != DeliverableStatus.Disputed) revert DeliverableNotDisputed();
        if (d.handoverAt == 0 || block.timestamp <= uint256(d.handoverAt) + ARBITER_WINDOW) {
            revert BackupWindowNotElapsed();
        }
        if (workerAmount > d.amount) revert AwardExceedsAllocation();
        if (block.timestamp > expiry) revert SignatureExpired();
        bytes32 digest = settlementDigest(taskId, index, workerAmount, expiry);
        if (!_validSignature(t.buyer, digest, buyerSignature) || !_validSignature(t.worker, digest, workerSignature)) {
            revert InvalidSignature();
        }
        uint256 nonce = settlementNonces[taskId][index]++;
        uint128 refund = d.amount - workerAmount;
        _settle(t, d, taskId, workerAmount, refund);
        emit AgreementSettled(taskId, index, workerAmount, refund, nonce);
    }

    function getTaskManifest(uint256 taskId) external view returns (uint64 version, bytes32 contentHash) {
        return (tasks[taskId].version, tasks[taskId].contentHash);
    }

    function getDeliveryEvidence(uint256 taskId, uint256 index)
        external
        view
        returns (uint64 deliveryDeadline, bool everSubmitted, bytes32 artifactHash, uint64 attestationExpiry)
    {
        Deliverable storage d = deliverables[taskId][index];
        return (d.deliveryDeadline, d.everSubmitted, d.artifactHash, d.attestationExpiry);
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
