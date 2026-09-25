// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;
import {BaseEscrowTest} from "./Base.t.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";

/// @dev Deterministic LOCAL fixture keys only; no persisted artifact or live attestation implied.
contract PactraSecurityTest is BaseEscrowTest {
    uint256 constant ATTESTOR_KEY = 101;
    uint256 constant BUYER_KEY = 102;
    uint256 constant WORKER_KEY = 103;
    bytes32 constant ARTIFACT = keccak256("local-fixture-artifact");
    uint64 constant EXPIRY = 400 days;

    function setUp() public override {
        buyer = vm.addr(BUYER_KEY);
        worker = vm.addr(WORKER_KEY);
        escrow = new PactraEscrow(vm.addr(ATTESTOR_KEY));
        manifest = escrow.manifestDigest(
            buyer, worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs()
        );
    }

    function _sign(uint256 key, bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _receipt(uint256 id, uint256 index, uint256 round, bytes32 artifact, uint64 expiry)
        internal
        returns (bytes memory)
    {
        return _sign(ATTESTOR_KEY, escrow.submissionDigest(id, index, round, artifact, expiry));
    }

    function _submit(uint256 id, uint256 index, uint256 round) internal {
        bytes memory sig = _receipt(id, index, round, ARTIFACT, EXPIRY);
        vm.prank(worker);
        escrow.submitDeliverable(id, index, ARTIFACT, EXPIRY, sig);
    }

    function _missed() internal returns (uint256 id) {
        id = _funded();
        _submit(id, 0, 1);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, ARTIFACT, uint64(block.timestamp));
        vm.warp(block.timestamp + 48 hours + 1);
        escrow.handoverDispute(id, 0);
        vm.warp(block.timestamp + 48 hours + 1);
    }

    function test_ZeroAttestorRejected() public {
        vm.expectRevert(PactraEscrow.InvalidParties.selector);
        new PactraEscrow(address(0));
    }

    function test_ChainAndVersionEnforcedAtCreation() public {
        vm.startPrank(buyer);
        vm.expectRevert(PactraEscrow.InvalidManifest.selector);
        escrow.createTask(worker, arbiter, backup, block.chainid + 1, 1, ARTIFACT, _configs());
        vm.expectRevert(PactraEscrow.InvalidManifest.selector);
        escrow.createTask(worker, arbiter, backup, block.chainid, 0, ARTIFACT, _configs());
        vm.stopPrank();
        assertEq(escrow.taskCount(), 0);
    }

    function test_ManifestStoredIsComputedFromExactTerms() public {
        uint256 id = _create();
        (,,,, bytes32 stored,,,,) = escrow.getTask(id);
        assertEq(stored, manifest);
        (uint64 version, bytes32 content) = escrow.getTaskManifest(id);
        assertEq(version, 1);
        assertEq(content, keccak256("pactra-test-manifest"));
        (uint64 deadline,,,) = escrow.getDeliveryEvidence(id, 0);
        assertEq(deadline, 365 days);
    }

    function testFuzz_AllManifestFieldsBound(uint8 field, uint128 delta) public {
        field = uint8(bound(field, 0, 12));
        delta = uint128(bound(delta, 1, type(uint64).max));
        PactraEscrow.DeliverableConfig[] memory c = _configs();
        if (field == 0) buyer = outsider;
        if (field == 1) worker = outsider;
        if (field == 2) arbiter = outsider;
        if (field == 3) backup = outsider;
        // vm.chainId supports uint64 only; full uint256 chain inputs are fuzzed in lifecycle suite.
        if (field == 4) vm.chainId(vm.getChainId() + (delta % 1_000_000) + 1);
        if (field == 7) c[0].amount += delta;
        if (field == 8) c[0].revisionLimit += 1;
        if (field == 9) c[0].reviewWindow += 1;
        if (field == 10) c[0].deliveryDeadline += 1;
        if (field == 11) {
            PactraEscrow.DeliverableConfig memory tmp = c[0];
            c[0] = c[1];
            c[1] = tmp;
        }
        if (field == 12) escrow = new PactraEscrow(vm.addr(ATTESTOR_KEY));
        assertNotEq(
            escrow.manifestDigest(
                buyer,
                worker,
                arbiter,
                backup,
                block.chainid,
                field == 5 ? 2 : 1,
                field == 6 ? ARTIFACT : keccak256("pactra-test-manifest"),
                c
            ),
            manifest
        );
    }

    function test_ManifestAttestorAndDomainEncodingIndependent() public {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PactraEscrow"),
                keccak256("2"),
                block.chainid,
                address(escrow)
            )
        );
        bytes32 structure = keccak256(
            abi.encode(
                escrow.MANIFEST_TYPEHASH(),
                buyer,
                worker,
                arbiter,
                backup,
                vm.addr(ATTESTOR_KEY),
                uint256(48 hours),
                uint256(50),
                block.chainid,
                uint64(1),
                keccak256("pactra-test-manifest"),
                keccak256(abi.encode(_configs()))
            )
        );
        assertEq(manifest, keccak256(abi.encodePacked(hex"1901", domain, structure)));
        // At same contract address, replacing immutable deployment configuration must alter digest.
        PactraEscrow different = new PactraEscrow(outsider);
        vm.etch(address(escrow), address(different).code);
        assertNotEq(
            escrow.manifestDigest(
                buyer, worker, arbiter, backup, block.chainid, 1, keccak256("pactra-test-manifest"), _configs()
            ),
            manifest
        );
    }

    function test_ExpiredTermsCannotCreateOrFund() public {
        uint256 id = _create();
        vm.prank(worker);
        escrow.acceptTask(id);
        vm.warp(365 days);
        vm.deal(buyer, _total());
        vm.prank(buyer);
        vm.expectRevert(PactraEscrow.DeliveryDeadlineElapsed.selector);
        escrow.fundTask{value: _total()}(id);
        vm.prank(buyer);
        vm.expectRevert(PactraEscrow.InvalidDeliverables.selector);
        escrow.createTask(worker, arbiter, backup, block.chainid, 2, ARTIFACT, _configs());
        assertEq(address(escrow).balance, 0);
    }

    function test_ReceiptRequiredAndNoBuyerVeto() public {
        uint256 id = _funded();
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.submitDeliverable(id, 0, ARTIFACT, EXPIRY, "");
        (,,,,, uint64 beforeTime,,,,) = escrow.getDeliverable(id, 0);
        assertEq(beforeTime, 0);
        vm.warp(3 days);
        _submit(id, 0, 1);
        (, bool ever, bytes32 hash, uint64 expiry) = escrow.getDeliveryEvidence(id, 0);
        assertTrue(ever);
        assertEq(hash, ARTIFACT);
        assertEq(expiry, EXPIRY);
        vm.warp(4 days + 1);
        vm.prank(worker);
        escrow.claimTimeout(id, 0);
        assertEq(escrow.balances(worker), AMOUNT0);
    }

    function testFuzz_ReceiptTamperingRejected(uint8 field) public {
        uint256 id = _funded();
        field = uint8(bound(field, 0, 7));
        uint256 signedId = field == 0 ? id + 1 : id;
        uint256 signedIndex = field == 1 ? 1 : 0;
        uint256 round = field == 2 ? 2 : 1;
        bytes32 artifact = field == 3 ? keccak256("other") : ARTIFACT;
        uint64 expiry = field == 4 ? EXPIRY - 1 : EXPIRY;
        bytes32 digest = escrow.submissionDigest(signedId, signedIndex, round, artifact, expiry);
        if (field == 5) {
            PactraEscrow other = new PactraEscrow(vm.addr(ATTESTOR_KEY));
            digest = other.submissionDigest(id, 0, 1, ARTIFACT, EXPIRY);
        }
        bytes memory sig = _sign(field == 6 ? BUYER_KEY : ATTESTOR_KEY, digest);
        if (field == 7) vm.chainId(block.chainid + 1);
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.submitDeliverable(id, 0, ARTIFACT, EXPIRY, sig);
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.AwaitingSubmission));
    }

    function test_ReceiptExpiryInclusiveAndRevisionNeedsFreshRound() public {
        uint256 id = _funded();
        bytes memory sig = _receipt(id, 0, 1, ARTIFACT, 10);
        vm.warp(11);
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.SignatureExpired.selector);
        escrow.submitDeliverable(id, 0, ARTIFACT, 10, sig);
        vm.warp(10);
        vm.prank(worker);
        escrow.submitDeliverable(id, 0, ARTIFACT, 10, sig);
        vm.prank(buyer);
        escrow.requestRevision(id, 0, 1, ARTIFACT, uint64(block.timestamp));
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.submitDeliverable(id, 0, ARTIFACT, 10, sig);
        _submit(id, 0, 2);
    }

    function test_HighSAndInvalidVAndZeroArtifactRejected() public {
        uint256 id = _funded();
        bytes32 digest = escrow.submissionDigest(id, 0, 1, ARTIFACT, EXPIRY);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTOR_KEY, digest);
        bytes32 highS =
            bytes32(uint256(0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141) - uint256(s));
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.submitDeliverable(id, 0, ARTIFACT, EXPIRY, abi.encodePacked(r, highS, v == 27 ? uint8(28) : uint8(27)));
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.submitDeliverable(id, 0, ARTIFACT, EXPIRY, abi.encodePacked(r, s, uint8(1)));
        bytes memory sig = _receipt(id, 0, 1, bytes32(0), EXPIRY);
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.submitDeliverable(id, 0, bytes32(0), EXPIRY, sig);
    }

    function test_RefundDeadlineEqualityAndIsolationAndRetry() public {
        uint256 id = _funded();
        vm.warp(365 days);
        vm.prank(buyer);
        vm.expectRevert(PactraEscrow.DeliveryDeadlineNotElapsed.selector);
        escrow.refundUnsubmitted(id, 0);
        vm.warp(365 days + 1);
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.NotTaskBuyer.selector);
        escrow.refundUnsubmitted(id, 0);
        vm.prank(buyer);
        escrow.refundUnsubmitted(id, 0);
        assertEq(escrow.balances(buyer), AMOUNT0);
        assertEq(uint8(_status(id, 1)), uint8(PactraEscrow.DeliverableStatus.AwaitingSubmission));
        vm.prank(buyer);
        vm.expectRevert(PactraEscrow.DeliverableNotAwaitingSubmission.selector);
        escrow.refundUnsubmitted(id, 0);
        vm.prank(buyer);
        escrow.refundUnsubmitted(id, 1);
        vm.prank(buyer);
        escrow.withdraw();
        assertEq(address(escrow).balance, 0);
    }

    function test_FirstSubmissionAtDeadlineAllowedAfterDeadlineDenied() public {
        uint256 id = _funded();
        vm.warp(365 days);
        _submit(id, 0, 1);
        vm.warp(365 days + 1);
        bytes memory sig = _receipt(id, 1, 1, ARTIFACT, EXPIRY);
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.DeliveryDeadlineElapsed.selector);
        escrow.submitDeliverable(id, 1, ARTIFACT, EXPIRY, sig);
    }

    function test_RevisionAwaitingNeverEligibleForNoSubmissionRefund() public {
        uint256 id = _funded();
        _submit(id, 0, 1);
        vm.prank(buyer);
        escrow.requestRevision(id, 0, 1, ARTIFACT, uint64(block.timestamp));
        vm.warp(366 days);
        vm.prank(buyer);
        vm.expectRevert(PactraEscrow.PreviouslySubmitted.selector);
        escrow.refundUnsubmitted(id, 0);
        _submit(id, 0, 2); // revision deadline policy remains unchanged
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.InReview));
    }

    function testFuzz_BilateralSettlementConservesAndConsumes(uint128 award) public {
        uint256 id = _missed();
        award = uint128(bound(award, 0, AMOUNT0));
        bytes32 digest = escrow.settlementDigest(id, 0, award, EXPIRY);
        bytes memory bs = _sign(BUYER_KEY, digest);
        bytes memory ws = _sign(WORKER_KEY, digest);
        vm.prank(outsider);
        escrow.settleByAgreement(id, 0, award, EXPIRY, bs, ws);
        assertEq(escrow.balances(worker), award);
        assertEq(escrow.balances(buyer), AMOUNT0 - award);
        assertEq(escrow.settlementNonces(id, 0), 1);
        assertNotEq(escrow.settlementDigest(id, 0, award, EXPIRY), digest);
        vm.expectRevert(PactraEscrow.DeliverableNotDisputed.selector);
        escrow.settleByAgreement(id, 0, award, EXPIRY, bs, ws);
        assertEq(uint8(_status(id, 1)), uint8(PactraEscrow.DeliverableStatus.AwaitingSubmission));
    }

    function test_NoHandoverOrBackupEqualityCannotUseAgreement() public {
        uint256 id = _funded();
        _submit(id, 0, 1);
        vm.prank(buyer);
        escrow.openDispute(id, 0, 1, ARTIFACT, uint64(block.timestamp));
        bytes32 digest = escrow.settlementDigest(id, 0, AMOUNT0, EXPIRY);
        bytes memory bs = _sign(BUYER_KEY, digest);
        bytes memory ws = _sign(WORKER_KEY, digest);
        vm.warp(100 days);
        vm.expectRevert(PactraEscrow.BackupWindowNotElapsed.selector);
        escrow.settleByAgreement(id, 0, AMOUNT0, EXPIRY, bs, ws);
        escrow.handoverDispute(id, 0);
        vm.warp(102 days);
        vm.expectRevert(PactraEscrow.BackupWindowNotElapsed.selector);
        escrow.settleByAgreement(id, 0, AMOUNT0, EXPIRY, bs, ws);
        vm.warp(102 days + 1);
        escrow.settleByAgreement(id, 0, AMOUNT0, EXPIRY, bs, ws);
    }

    function testFuzz_SettlementTamperingAndUnilateralRejected(uint8 field) public {
        uint256 id = _missed();
        field = uint8(bound(field, 0, 8));
        uint128 award = AMOUNT0 / 2;
        bytes32 digest = escrow.settlementDigest(
            field == 0 ? id + 1 : id,
            field == 1 ? 1 : 0,
            field == 2 ? award + 1 : award,
            field == 3 ? EXPIRY - 1 : EXPIRY
        );
        if (field == 4) {
            PactraEscrow other = new PactraEscrow(vm.addr(ATTESTOR_KEY));
            digest = other.settlementDigest(id, 0, award, EXPIRY);
        }
        bytes memory bs = _sign(BUYER_KEY, digest);
        bytes memory ws = _sign(WORKER_KEY, digest);
        if (field == 5) bs = "";
        if (field == 6) ws = "";
        if (field == 7) ws = bs;
        if (field == 8) vm.chainId(block.chainid + 1);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.settleByAgreement(id, 0, award, EXPIRY, bs, ws);
        assertEq(escrow.balances(buyer), 0);
        assertEq(escrow.balances(worker), 0);
        assertEq(escrow.settlementNonces(id, 0), 0);
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.Disputed));
    }

    function test_SettlementExpiryAndExcessAward() public {
        uint256 id = _missed();
        uint64 expiry = uint64(block.timestamp);
        bytes32 digest = escrow.settlementDigest(id, 0, 0, expiry);
        bytes memory bs = _sign(BUYER_KEY, digest);
        bytes memory ws = _sign(WORKER_KEY, digest);
        vm.expectRevert(PactraEscrow.AwardExceedsAllocation.selector);
        escrow.settleByAgreement(id, 0, AMOUNT0 + 1, expiry, bs, ws);
        vm.warp(uint256(expiry) + 1);
        vm.expectRevert(PactraEscrow.SignatureExpired.selector);
        escrow.settleByAgreement(id, 0, 0, expiry, bs, ws);
        vm.warp(expiry);
        escrow.settleByAgreement(id, 0, 0, expiry, bs, ws);
        assertEq(escrow.balances(buyer), AMOUNT0);
    }
}
