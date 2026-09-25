// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;
import {PactraSecurityTest} from "./Security.t.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";

/// @dev Strict digest-specific ERC-1271 fixture; can emulate malformed/reverting validators.
contract ReceiptWallet {
    bytes32 public approved;
    uint8 public mode;

    function approve(bytes32 digest) external {
        approved = digest;
    }

    function setMode(uint8 value) external {
        mode = value;
    }

    function isValidSignature(bytes32 digest, bytes calldata signature) external view returns (bytes4) {
        if (mode == 1) revert("fixture rejection");
        if (mode == 2) {
            assembly { return(0, 1) }
        }
        if (mode == 3) {
            assembly {
                mstore(0, 0x1626ba7effffffffffffffffffffffffffffffffffffffffffffffffffffffff)
                return(0, 32)
            }
        }
        return
            digest == approved && keccak256(signature) == keccak256(hex"abcd") ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}

contract PactraContractSignatureTest is PactraSecurityTest {
    function test_ERC1271ReceiptRejectsWrongDigestRevertMalformedAndAcceptsExact() public {
        ReceiptWallet wallet = new ReceiptWallet();
        escrow = new PactraEscrow(address(wallet));
        uint256 id = _funded();
        bytes32 digest = escrow.submissionDigest(id, 0, 1, ARTIFACT, EXPIRY);
        vm.prank(worker);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.submitDeliverable(id, 0, ARTIFACT, EXPIRY, hex"abcd");
        wallet.approve(digest);
        for (uint8 i = 1; i <= 3; ++i) {
            wallet.setMode(i);
            vm.prank(worker);
            vm.expectRevert(PactraEscrow.InvalidSignature.selector);
            escrow.submitDeliverable(id, 0, ARTIFACT, EXPIRY, hex"abcd");
        }
        wallet.setMode(0);
        vm.prank(worker);
        escrow.submitDeliverable(id, 0, ARTIFACT, EXPIRY, hex"abcd");
        assertEq(uint8(_status(id, 0)), uint8(PactraEscrow.DeliverableStatus.InReview));
    }

    function test_ERC1271BothPartiesMustApproveExactSettlement() public {
        ReceiptWallet b = new ReceiptWallet();
        ReceiptWallet w = new ReceiptWallet();
        buyer = address(b);
        worker = address(w);
        uint256 id = _missed();
        bytes32 digest = escrow.settlementDigest(id, 0, AMOUNT0, EXPIRY);
        b.approve(digest);
        vm.expectRevert(PactraEscrow.InvalidSignature.selector);
        escrow.settleByAgreement(id, 0, AMOUNT0, EXPIRY, hex"abcd", hex"abcd");
        w.approve(digest);
        escrow.settleByAgreement(id, 0, AMOUNT0, EXPIRY, hex"abcd", hex"abcd");
        assertEq(escrow.balances(worker), AMOUNT0);
    }
}
