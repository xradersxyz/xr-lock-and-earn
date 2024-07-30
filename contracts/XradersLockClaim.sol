// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interface/IConnectToken.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

contract XradersLockClaim is IConnectToken, Initializable, OwnableUpgradeable, PausableUpgradeable, ReentrancyGuardUpgradeable {
    IERC20 public token;
    bytes32 public merkleRoot;
    uint256 public lastMerkleUpdateDay;

    mapping(address => uint256) public lastClaimDay;
    mapping(address => uint256) public claimedAmount;

    event Claimed(address indexed claimant, uint256 amount);
    event MerkleRootUpdated(bytes32 newMerkleRoot);
    
    function initialize(address initialOwner, bytes32 _merkleRoot) public initializer {
        __Ownable_init(initialOwner);
        merkleRoot = _merkleRoot;
        lastMerkleUpdateDay = block.timestamp / 1 days;
    }

    function connectToOtherContracts(
        address[] memory otherContracts
    ) external override onlyOwner {
        require(otherContracts[0] != address(0), "Invalid token address");
        token = IERC20(otherContracts[0]);
    }

    function isClaimedToday(address account) public view returns (bool) {
        return lastClaimDay[account] >= block.timestamp / 1 days;
    }

    function pause() public onlyOwner {
        _pause();
    }

    function unpause() public onlyOwner {
        _unpause();
    }

    function claim(uint256 amount, bytes32[] calldata merkleProof) external nonReentrant whenNotPaused {
        require(!isClaimedToday(msg.sender), "Already claimed today.");

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(msg.sender, amount))));
        require(MerkleProof.verify(merkleProof, merkleRoot, leaf), "Invalid proof.");

        lastClaimDay[msg.sender] = block.timestamp / 1 days;
        claimedAmount[msg.sender] += amount;
        token.transfer(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    function getClaimedAmount(address account) external view returns (uint256) {
        return claimedAmount[account];
    }

    function getUnclaimedAmount(
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external view whenNotPaused returns (uint256) {
        if (isClaimedToday(account)) {
            return 0; //If a claim has already been made
        }

        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(account, amount))));
        bool valid = MerkleProof.verify(merkleProof, merkleRoot, leaf);
        if (!valid) {
            return 0; //If Merkle Proof is invalid
        }
        return amount;
    }

    function withdrawAll() public onlyOwner whenNotPaused {
        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(owner(), balance), "Transfer failed");
    }

    function updateMerkleRoot(bytes32 _newMerkleRoot) external onlyOwner whenNotPaused {
        require(block.timestamp / 1 days > lastMerkleUpdateDay, "Merkle root can only be updated once a day");
        merkleRoot = _newMerkleRoot;
        lastMerkleUpdateDay = block.timestamp / 1 days;
        emit MerkleRootUpdated(_newMerkleRoot);
    }
}
