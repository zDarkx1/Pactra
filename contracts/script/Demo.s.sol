// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {Script, console2} from "forge-std/Script.sol";
import {PactraEscrow} from "../src/PactraEscrow.sol";
import {FixtureAttestor} from "../test/FixtureAttestor.sol";

/// @dev Local anvil demonstration. Deploys the escrow, then runs one full
///      task lifecycle on-chain: create → worker accepts → fund → submit →
///      buyer accepts (worker payout) → dispute split (arbiter) → withdrawals.
///      Uses anvil's deterministic LOCAL-ONLY accounts via their well-known
///      private keys; never reuse these keys anywhere else. Not a submission
///      artifact; not run in CI.
contract DemoScript is Script {
    // anvil accounts 0..3 (LOCAL ONLY)
    address constant BUYER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
    address constant WORKER = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
    address constant ARBITER = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
    address constant BACKUP = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

    uint128 constant AMOUNT_A = 1 ether;
    uint128 constant AMOUNT_B = 2 ether;
    uint64 constant WINDOW = 2 days;
    uint16 constant REVISION_LIMIT = 1;

    function run() external returns (PactraEscrow escrow) {
        require(block.chainid == 31337, "LOCAL FIXTURE ONLY");
        vm.startBroadcast(BUYER);
        escrow = new PactraEscrow(address(new FixtureAttestor()));
        console2.log("=== deploy ===");
        console2.log("escrow:", address(escrow));

        PactraEscrow.DeliverableConfig[] memory configs = new PactraEscrow.DeliverableConfig[](2);
        configs[0] = PactraEscrow.DeliverableConfig({
            amount: AMOUNT_A,
            revisionLimit: REVISION_LIMIT,
            reviewWindow: WINDOW,
            deliveryDeadline: uint64(block.timestamp + 30 days)
        });
        configs[1] = PactraEscrow.DeliverableConfig({
            amount: AMOUNT_B,
            revisionLimit: 0,
            reviewWindow: WINDOW,
            deliveryDeadline: uint64(block.timestamp + 30 days)
        });

        // Buyer creates the task and funds it after worker acceptance.
        uint256 id =
            escrow.createTask(WORKER, ARBITER, BACKUP, block.chainid, 1, keccak256("demo manifest v1"), configs);
        console2.log("=== createTask ===");
        console2.log("taskId:", id);
        console2.log("totalAllocation:", escrow.totalAllocation(id));
        vm.stopBroadcast();

        vm.startBroadcast(WORKER);
        escrow.acceptTask(id);
        vm.stopBroadcast();

        vm.startBroadcast(BUYER);
        escrow.fundTask{value: escrow.totalAllocation(id)}(id);
        vm.stopBroadcast();
        console2.log("=== funded ===");
        console2.log("escrow balance:", address(escrow).balance);

        // Deliverable 0: submit → buyer accepts → worker award.
        vm.startBroadcast(WORKER);
        escrow.submitDeliverable(id, 0, keccak256("fixture-artifact-0"), type(uint64).max, hex"f1");
        vm.stopBroadcast();
        (,,,,, uint64 submittedAt0,,,,) = escrow.getDeliverable(id, 0);
        vm.startBroadcast(BUYER);
        escrow.acceptDeliverable(id, 0, 1, keccak256("fixture-artifact-0"), submittedAt0);
        vm.stopBroadcast();
        console2.log("=== deliverable 0: submitted & accepted ===");
        console2.log("worker withdrawable:", escrow.balances(WORKER));

        // Deliverable 1: submit → dispute → arbiter splits 50/50.
        vm.startBroadcast(WORKER);
        escrow.submitDeliverable(id, 1, keccak256("fixture-artifact-1"), type(uint64).max, hex"f1");
        vm.stopBroadcast();
        (,,,,, uint64 submittedAt1,,,,) = escrow.getDeliverable(id, 1);
        vm.startBroadcast(BUYER);
        escrow.openDispute(id, 1, 1, keccak256("fixture-artifact-1"), submittedAt1);
        vm.stopBroadcast();
        vm.startBroadcast(ARBITER);
        escrow.resolveDispute(id, 1, AMOUNT_B / 2);
        vm.stopBroadcast();
        console2.log("=== deliverable 1: disputed & resolved 50/50 ===");
        console2.log("worker withdrawable:", escrow.balances(WORKER));
        console2.log("buyer withdrawable:", escrow.balances(BUYER));

        // Pull-based withdrawals.
        vm.startBroadcast(WORKER);
        escrow.withdraw();
        vm.stopBroadcast();
        vm.startBroadcast(BUYER);
        escrow.withdraw();
        vm.stopBroadcast();
        console2.log("=== withdrawals ===");
        console2.log("worker ETH:", WORKER.balance);
        console2.log("buyer ETH:", BUYER.balance);
        console2.log("escrow residual:", address(escrow).balance);

        (,,,,,, PactraEscrow.TaskStatus status,,) = escrow.getTask(id);
        console2.log("task status (3 = Completed):", uint8(status));
    }
}
