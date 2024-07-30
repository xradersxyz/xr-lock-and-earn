import { expect } from "chai";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import hre from "hardhat";
import { XrToken } from "../typechain-types";

describe("XradersLockClaim", function () {
  async function deployFixture() {
    const [owner, addr1, addr2] = await hre.ethers.getSigners();

    const XrTokenFactory = await hre.ethers.getContractFactory("XrToken");
    const xrToken = await XrTokenFactory.deploy(owner.address) as XrToken;

    const claims = [
      { address: addr1.address, amount: hre.ethers.parseUnits("100") },
      { address: addr2.address, amount: hre.ethers.parseUnits("50") },
    ];
    const tree = StandardMerkleTree.of(
      claims.map(({ address, amount }) => [address, amount.toString()]),
      ["address", "uint256"]
    );

    const XradersLockClaimFactory = await hre.ethers.getContractFactory("XradersLockClaim");
    const xradersLockClaim = await XradersLockClaimFactory.deploy();
    xradersLockClaim.initialize(owner.address, tree.root);
    xradersLockClaim.connectToOtherContracts([xrToken.getAddress()]);

    await xrToken.transfer(xradersLockClaim.getAddress(), hre.ethers.parseUnits("1000"));

    return { xrToken, xradersLockClaim, owner, addr1, addr2, claims, tree };
  }

  it("should allow claiming once per day", async function () {
    const { xrToken, xradersLockClaim, addr1, tree } = await loadFixture(deployFixture);

    const claimAmount = hre.ethers.parseUnits("100");
    const proof = tree.getProof([addr1.address, claimAmount.toString()]);

    // Initial claim
    await xradersLockClaim.connect(addr1).claim(claimAmount, proof);
    expect(await xrToken.balanceOf(addr1.address)).to.equal(claimAmount);

    // Attempt to claim again on the same day
    await expect(xradersLockClaim.connect(addr1).claim(claimAmount, proof)).to.be.revertedWith("Already claimed today.");

    // Move to the next day
    await time.increaseTo((await time.latest()) + 24 * 60 * 60 + 1);
    await xradersLockClaim.connect(addr1).claim(claimAmount, proof);
    expect(await xrToken.balanceOf(addr1.address)).to.equal(hre.ethers.parseUnits("200"));
  });

  it("should update Merkle root and allow new claims", async function () {
    const { xrToken, xradersLockClaim, addr1, addr2, tree } = await loadFixture(deployFixture);

    const claimAmount = hre.ethers.parseUnits("100");
    const proof = tree.getProof([addr1.address, claimAmount.toString()]);

    // Initial claim
    await xradersLockClaim.connect(addr1).claim(claimAmount, proof);
    expect(await xrToken.balanceOf(addr1.address)).to.equal(claimAmount);

    // Move to the next day
    await time.increaseTo((await time.latest()) + 24 * 60 * 60 + 1);

    // Update Merkle root
    const newClaims = [
      { address: addr1.address, amount: hre.ethers.parseUnits("200") },
      { address: addr2.address, amount: hre.ethers.parseUnits("100") },
    ];
    const newTree = StandardMerkleTree.of(
      newClaims.map(({ address, amount }) => [address, amount.toString()]),
      ["address", "uint256"]
    );
    await xradersLockClaim.updateMerkleRoot(newTree.root);

    const newClaimAmount = hre.ethers.parseUnits("200");
    const newProof = newTree.getProof([addr1.address, newClaimAmount.toString()]);

    // Claim with the updated Merkle root
    await xradersLockClaim.connect(addr1).claim(newClaimAmount, newProof);
    expect(await xrToken.balanceOf(addr1.address)).to.equal(hre.ethers.parseUnits("300"));
  });

  it("should revert on invalid proof", async function () {
    const { xradersLockClaim, addr1, addr2 } = await loadFixture(deployFixture);

    const claimAmount = hre.ethers.parseUnits("50");
    const invalidClaims = [
      { address: addr1.address, amount: hre.ethers.parseUnits("50") },
      { address: addr2.address, amount: hre.ethers.parseUnits("100") },
    ];
    const invalidTree = StandardMerkleTree.of(
      invalidClaims.map(({ address, amount }) => [address, amount.toString()]),
      ["address", "uint256"]
    );
    const invalidProof = invalidTree.getProof([addr1.address, claimAmount.toString()]);

    await expect(xradersLockClaim.connect(addr1).claim(claimAmount, invalidProof)).to.be.revertedWith("Invalid proof.");
  });
});
