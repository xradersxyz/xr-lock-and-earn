// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interface/IConnectToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

contract XradersLock is IConnectToken, Initializable, OwnableUpgradeable {
    IERC20 public token;
    IERC20Permit public tokenWithPermit;

    uint256 public unlockPeriod;
    uint256 public penaltyRate;
    address public treasuryAddress;

    struct Lock {
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => Lock) public userLock;
    mapping(address => Lock[]) public userUnlocks;

    event UnlockPeriodUpdated(uint256 newUnlockPeriod);
    event PenaltyRateUpdated(uint256 newPenaltyRate);
    event TreasuryAddressUpdated(address newTreasuryAddress);
    event PanckaeRouterUpdated(address pancakeRouter);
    event PathUpdated(address pathAddress);
    event Locked(address indexed user, uint256 amount);
    event Unlocked(address indexed user, uint256 amount);
    event Redeemed(address indexed user, uint256 amount);
    event FastRedeemed(address indexed user, uint256 amount, uint256 penaltyAmount);
    event FastRedeemedInBNB(address indexed user, uint256 amount, uint256 penaltyAmount);
    event PenaltyPaidInBNB(address indexed user, uint256 amountInBNB);
    event PenaltyPaidInXR(address indexed user, uint256 amountInXR);

    IUniswapV2Router02 public pancakeRouter;
    address[] public path;
    

    function initialize(
        address initialOwner,
        uint256 _unlockPeriod,
        uint256 _penaltyRate,
        address _treasuryAddress
    ) public initializer {
        __Ownable_init(initialOwner);
        unlockPeriod = _unlockPeriod;
        penaltyRate = _penaltyRate;
        treasuryAddress = _treasuryAddress;
    }

    function connectToOtherContracts(address[] memory otherContracts) external override onlyOwner {
        require(otherContracts[0] != address(0), "Invalid token address");
        token = IERC20(otherContracts[0]);
        tokenWithPermit = IERC20Permit(otherContracts[0]);

        // Initialize the swap path for XR to BNB
        path = new address[](2);
        path[0] = address(token);
        path[1] = address(pancakeRouter.WETH());
    }

    function setUnlockPeriod(uint256 _unlockPeriod) external onlyOwner {
        unlockPeriod = _unlockPeriod;
        emit UnlockPeriodUpdated(_unlockPeriod);
    }

    function setPenaltyRate(uint256 _penaltyRate) external onlyOwner {
        penaltyRate = _penaltyRate;
        emit PenaltyRateUpdated(_penaltyRate);
    }

    function setTreasuryAddress(address _treasuryAddress) external onlyOwner {
        require(_treasuryAddress != address(0), "Invalid treasury address");
        treasuryAddress = _treasuryAddress;
        emit TreasuryAddressUpdated(_treasuryAddress);
    }

    function setPancakeRouter(address _pancakeRouter) external onlyOwner {
        require(_pancakeRouter != address(0), "Invalid PancakeRouter address");
        pancakeRouter = IUniswapV2Router02(_pancakeRouter);
        emit PanckaeRouterUpdated(_pancakeRouter);
    }

    function setPath(address pathAddress) external onlyOwner {
        path = new address[](2);
        path[0] = pathAddress;
        path[1] = address(pancakeRouter.WETH());
        emit PathUpdated(pathAddress);
    }

    function lock(
        uint256 amount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        require(amount > 0, "Amount must be greater than 0");
        require(amount % (10**18) == 0, "Amount must be a whole number of tokens");

        tokenWithPermit.permit(
            msg.sender,
            address(this),
            amount,
            deadline,
            v,
            r,
            s
        );
        token.transferFrom(msg.sender, address(this), amount);

        userLock[msg.sender].amount += amount;
        userLock[msg.sender].timestamp = block.timestamp;

        emit Locked(msg.sender, amount);
    }

    function unlock(uint256 amount) external {
        Lock storage lockData = userLock[msg.sender];
        require(amount > 0 && amount <= lockData.amount, "Invalid unlock amount");

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
        require(block.timestamp < unlocks[index].timestamp, "Use redeem function after unlock period");

        uint256 amount = (unlocks[index].amount * (100 - penaltyRate)) / 100;
        uint256 penaltyAmount = unlocks[index].amount - amount;

        require(token.transfer(msg.sender, amount), "Token transfer failed");
        payPenaltyInXR(penaltyAmount);

        unlocks[index] = unlocks[unlocks.length - 1];
        unlocks.pop();

        emit FastRedeemed(msg.sender, amount, penaltyAmount);
    }

    function fastRedeemInBNB(uint256 index) external payable {
        require(index < userUnlocks[msg.sender].length, "Invalid unlock index");

        Lock[] storage unlocks = userUnlocks[msg.sender];
        require(unlocks[index].amount > 0, "No unlock request found");
        require(block.timestamp < unlocks[index].timestamp, "Use redeem function after unlock period");

        uint256 penaltyAmount = getPenaltyAmountInBNB(index);
        payPenaltyInBNB(penaltyAmount);
        
        uint256 redeemAmount = unlocks[index].amount;
        require(token.transfer(msg.sender, redeemAmount), "Token transfer failed");

        unlocks[index] = unlocks[unlocks.length - 1];
        unlocks.pop();

        emit FastRedeemedInBNB(msg.sender, redeemAmount, penaltyAmount);
    }

    function getPenaltyAmountInBNB(uint256 index) public view returns (uint256) {
        require(index < userUnlocks[msg.sender].length, "Invalid unlock index");
        Lock[] storage unlocks = userUnlocks[msg.sender];
        uint256 amount = unlocks[index].amount;

        uint256 currentPenaltyRate = getCurrentPenaltyRate(unlocks[index].timestamp);
        uint256 penaltyXR = (amount * currentPenaltyRate) / 100;

        uint256[] memory amountsOut = pancakeRouter.getAmountsOut(10**18, path);
        uint256 bnbPerXr = amountsOut[amountsOut.length - 1];
        
        return (bnbPerXr * penaltyXR) / (10**18);
    }

    function getCurrentPenaltyRate(uint256 unlockTimestamp) public view returns (uint256) {
        if (block.timestamp >= unlockTimestamp) {
            return 0;
        }

        uint256 timeElapsed = block.timestamp - (unlockTimestamp - unlockPeriod);
        uint256 timePercentElapsed = (timeElapsed * 100) / unlockPeriod;
        uint256 reducedPenaltyRate = penaltyRate * timePercentElapsed / 100;

        return penaltyRate - reducedPenaltyRate;
    }

    function payPenaltyInBNB(uint256 penaltyAmount) internal {
        require(msg.value >= penaltyAmount, "Insufficient BNB sent");
        
        if (msg.value > penaltyAmount) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - penaltyAmount}("");
            require(refundSuccess, "Refund failed");
        }
        
        (bool success, ) = treasuryAddress.call{value: penaltyAmount}("");
        require(success, "BNB transfer failed");

        emit PenaltyPaidInBNB(msg.sender, penaltyAmount);
    }

    function payPenaltyInXR(uint256 penaltyAmount) internal {
        require(token.transfer(treasuryAddress, penaltyAmount), "Penalty transfer failed");
        emit PenaltyPaidInXR(msg.sender, penaltyAmount);
    }

    function getTotalLockedAmount(address user) public view returns (uint256) {
        return userLock[user].amount;
    }

    function getRedeeambleAmount(address user) public view returns (uint256) {
        Lock[] memory unlocks = userUnlocks[user];
        uint256 amount = 0;

        for (uint256 i = 0; i < unlocks.length; i++) {
            if (block.timestamp >= unlocks[i].timestamp) {
                amount += unlocks[i].amount;
            }
        }

        return amount;
    }

    function getUserUnlocks(address user) external view returns (Lock[] memory) {
        return userUnlocks[user];
    }

    function getPath() public view returns (address[] memory) {
        return path;
    }
}