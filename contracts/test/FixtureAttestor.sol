// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

/// @dev LOCAL TEST ONLY. Existing lifecycle tests isolate financial behavior;
/// security tests separately exercise real EOA receipts and strict ERC-1271.
contract FixtureAttestor {
    function isValidSignature(bytes32, bytes calldata signature) external pure returns (bytes4) {
        return keccak256(signature) == keccak256(hex"f1") ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
