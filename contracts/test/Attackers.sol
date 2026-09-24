// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.37;

import {PactraEscrow} from "../src/PactraEscrow.sol";

/// @dev Receiver that can reenter withdraw() while receiving ETH. The inner
///      reentrant call reverts (balance already zeroed) and is swallowed by
///      try/catch, so the outer withdrawal must still complete exactly once.
contract ReentrantWithdrawer {
    PactraEscrow public immutable escrow;
    bool public attack;

    constructor(PactraEscrow escrow_) {
        escrow = escrow_;
    }

    function setAttack(bool attack_) external {
        attack = attack_;
    }

    function withdraw() external {
        escrow.withdraw();
    }

    receive() external payable {
        if (attack) {
            try escrow.withdraw() {} catch {}
        }
    }
}

/// @dev Receiver whose acceptance can be toggled to simulate a failing
///      withdrawal followed by a successful retry.
contract ToggleReceiver {
    bool public accepting;

    function setAccepting(bool accepting_) external {
        accepting = accepting_;
    }

    receive() external payable {
        require(accepting, "rejecting");
    }
}
