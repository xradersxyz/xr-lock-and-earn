// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interface/IConnectToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";


contract XradersLock is IConnectToken, Initializable, OwnableUpgradeable {
    IERC20 public token;
    uint256 public unlockPeriod;
    uint256 public penaltyRate;

    struct Lock {
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => Lock) public userLock;
    mapping(address => Lock[]) public userUnlocks;

    event UnlockPeriodUpdated(uint256 newUnlockPeriod);
    event PenaltyRateUpdated(uint256 newPenaltyRate);
    event Locked(address indexed user, uint256 amount);
    event Unlocked(address indexed user, uint256 amount);
    event Redeemed(address indexed user, uint256 amount);
    event FastRedeemed(address indexed user, uint256 amount, uint256 penaltyAmount);

    function initialize(
        address initialOwner,
        uint256 _unlockPeriod,
        uint256 _penaltyRate
    ) public initializer {
        __Ownable_init(initialOwner);
        unlockPeriod = _unlockPeriod;
        penaltyRate = _penaltyRate;
    }

    function connectToOtherContracts(
        address[] memory otherContracts
    ) external override onlyOwner {
        require(otherContracts[0] != address(0), "Invalid token address");
        token = IERC20(otherContracts[0]);
    }

    function setUnlockPeriod(uint256 _unlockPeriod) external onlyOwner {
        unlockPeriod = _unlockPeriod;
        emit UnlockPeriodUpdated(_unlockPeriod);
    }

    function setPenaltyRate(uint256 _penaltyRate) external onlyOwner {
        penaltyRate = _penaltyRate;
        emit PenaltyRateUpdated(_penaltyRate);
    }

    function lock(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        token.transferFrom(msg.sender, address(this), amount);

        Lock storage lockData = userLock[msg.sender];
        lockData.amount += amount;
        lockData.timestamp = block.timestamp;

        emit Locked(msg.sender, amount);
    }

    function unlock(uint256 amount) external {
        Lock storage lockData = userLock[msg.sender];
        require(
            amount > 0 && amount <= lockData.amount,
            "Invalid unlock amount"
        );

        lockData.amount -= amount;
        userUnlocks[msg.sender].push(
            Lock(amount, block.timestamp + unlockPeriod)
        );

        emit Unlocked(msg.sender, amount);
    }

    function redeem() external {
        Lock[] storage unlocks = userUnlocks[msg.sender];
        require(unlocks.length > 0, "No unlock found");

        uint256 amount = 0;
        uint256 i = 0;

        while (i < unlocks.length) {
            if (block.timestamp >= unlocks[i].timestamp) {
                amount += unlocks[i].amount;
                unlocks[i] = unlocks[unlocks.length - 1];
                unlocks.pop();
            } else {
                i++;
            }
        }

        require(amount > 0, "No tokens available for redemption");
        token.transfer(msg.sender, amount);

        emit Redeemed(msg.sender, amount);
    }

    function fastRedeem(uint256 index) external {
        require(index < userUnlocks[msg.sender].length, "Invalid unlock index");

        Lock[] storage unlocks = userUnlocks[msg.sender];
        require(unlocks[index].amount > 0, "No unlock request found");
        require(
            block.timestamp < unlocks[index].timestamp,
            "Use redeem function after unlock period"
        );

        uint256 amount = (unlocks[index].amount * (100 - penaltyRate)) / 100;
        uint256 penaltyAmount = unlocks[index].amount - amount;
        
        require(token.transfer(msg.sender, amount), "Token transfer failed");
        ERC20Burnable(address(token)).burn(penaltyAmount);

        unlocks[index] = unlocks[unlocks.length - 1];
        unlocks.pop();

        emit FastRedeemed(msg.sender, amount, penaltyAmount);
    }

    function getTotalLockedAmount(address user) public view returns (uint256) {
        return userLock[user].amount;
    }

    function getRedeeambleAmount(address user) public view returns (uint256) {
        Lock[] memory unlocks = userUnlocks[user];
        uint256 amount = 0;

        for(uint256 i=0;i<unlocks.length;i++) {
            if(block.timestamp >= unlocks[i].timestamp) {
                amount += unlocks[i].amount;
            }
        }

        return amount;
    }

    function getUserUnlocks(address user) external view returns (Lock[] memory) {
        return userUnlocks[user];
    }
}
