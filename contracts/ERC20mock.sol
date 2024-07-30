// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract ERC20Mock is ERC20, ERC20Burnable {
    bool public failTransfer = false;

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function setFailTransfer(bool _fail) external {
        failTransfer = _fail;
    }

    function transfer(address recipient, uint256 amount) public virtual override returns (bool) {
        if (failTransfer) {
            revert("Transfer failed");
        }
        return super.transfer(recipient, amount);
    }
}
