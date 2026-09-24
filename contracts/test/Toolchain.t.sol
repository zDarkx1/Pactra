// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {Test} from "forge-std/Test.sol";

contract ToolchainTest is Test {
    function test_ToolchainCompilesAndRuns() public pure {
        assertTrue(true, "foundry toolchain smoke");
    }

    function test_FuzzEngineRuns(uint128 a, uint128 b) public pure {
        uint256 sum = uint256(a) + uint256(b);
        assertGe(sum, uint256(a), "fuzz smoke");
        assertGe(sum, uint256(b), "fuzz smoke");
    }
}
