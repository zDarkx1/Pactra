// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {Script} from "forge-std/Script.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";

/// @notice Explicit deployment entry point. Deployment requires owner
///         approval and the release gate in docs/SETTLEMENT_DECISIONS.md;
///         nothing here is run by CI. Never broadcast with a committed
///         private key: use a fresh cast wallet and record the resulting
///         chain, address, transaction, ABI and source commit in
///         contracts/deployments/.
contract PactraEscrowScript is Script {
    function run() external returns (PactraEscrow escrow) {
        address attestor = vm.envAddress("EVIDENCE_ATTESTOR");
        vm.startBroadcast();
        escrow = new PactraEscrow(attestor);
        vm.stopBroadcast();
    }
}
