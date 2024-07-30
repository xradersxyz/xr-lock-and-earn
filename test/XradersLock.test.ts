import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("XradersLock", function () {
  // Fixture to deploy the contracts and set up initial state
  async function deployXradersLockFixture() {
    const unlockPeriod = 7 * 24 * 60 * 60; // 7 days in seconds
    const penaltyRate = 20; // 20%
    const initialSupply = hre.ethers.parseEther("10000");

    // Contracts are deployed using the first signer/account by default
    const [owner, addr1, addr2] = await hre.ethers.getSigners();

    // Deploy ERC20mock Token
    const TokenFactory = await hre.ethers.getContractFactory("ERC20Mock");
    const token = await TokenFactory.deploy("Test Token", "TTK", initialSupply);

    // Deploy XR Token
    // const TokenFactory = await hre.ethers.getContractFactory("XrToken");
    // const token = await TokenFactory.deploy(owner.address);

    // Deploy XradersLock Contract
    const XradersLockFactory = await hre.ethers.getContractFactory("XradersLock");
    const xradersLock = await XradersLockFactory.deploy();
    await xradersLock.initialize(owner.address, unlockPeriod, penaltyRate);

    // Connect XradersLock contract to Token
    await xradersLock.connectToOtherContracts([token.getAddress()]);

    // Distribute tokens
    await token.transfer(addr1.address, hre.ethers.parseEther("1000"));
    await token.transfer(addr2.address, hre.ethers.parseEther("1000"));

    return { xradersLock, token, unlockPeriod, penaltyRate, owner, addr1, addr2 };
  }

  describe("Deployment", function () {
    it("Should set the correct unlockPeriod and penaltyRate", async function () {
      const { xradersLock, unlockPeriod, penaltyRate } = await loadFixture(deployXradersLockFixture);

      expect(await xradersLock.unlockPeriod()).to.equal(unlockPeriod);
      expect(await xradersLock.penaltyRate()).to.equal(penaltyRate);
    });
  });

  describe("Locking Tokens", function () {
    it("Should lock tokens", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      const lock = await xradersLock.userLock(addr1.address);
      expect(lock.amount).to.equal(hre.ethers.parseEther("100"));
    });
  });

  describe("Unlocking Tokens", function () {
    it("Should unlock tokens", async function () {
      const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      const lock = await xradersLock.userLock(addr1.address);
      expect(lock.amount).to.equal(hre.ethers.parseEther("50"));

      const unlocks = await xradersLock.getUserUnlocks(addr1.address);
      expect(unlocks.length).to.equal(1);
      expect(unlocks[0].amount).to.equal(hre.ethers.parseEther("50"));
      expect(unlocks[0].timestamp).to.be.gte((await time.latest()) + unlockPeriod - 1);
    });

    it("Should not unlock zero tokens", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("0"))).to.be.revertedWith(
        "Invalid unlock amount"
      );
    });

    it("Should not unlock more tokens than locked", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("200"))).to.be.revertedWith(
        "Invalid unlock amount"
      );
    });
  });

  describe("Redeeming Tokens", function () {
    it("Should redeem tokens after unlock period", async function () {
      const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      // Increase time to pass unlock period
      await time.increase(unlockPeriod + 1);

      await xradersLock.connect(addr1).redeem();

      const unlocks = await xradersLock.getUserUnlocks(addr1.address);
      expect(unlocks.length).to.equal(0);

      const balance = await token.balanceOf(addr1.address);
      expect(balance).to.equal(hre.ethers.parseEther("950"));
    });

    it("Should fast redeem tokens with penalty and burn penalty tokens", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      const initialTotalSupply = await token.totalSupply();

      await xradersLock.connect(addr1).fastRedeem(0);

      const unlocks = await xradersLock.getUserUnlocks(addr1.address);
      expect(unlocks.length).to.equal(0);

      const balance = await token.balanceOf(addr1.address);
      const expectedBalance = hre.ethers.parseEther("940");
      expect(balance).to.equal(expectedBalance);

      const finalTotalSupply = await token.totalSupply();
      const penaltyAmount = hre.ethers.parseEther("10");
      expect(finalTotalSupply).to.equal(initialTotalSupply - penaltyAmount);
    });

    it("Should revert redeem with no unlocks", async function () {
      const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);

      await expect(xradersLock.connect(addr1).redeem()).to.be.revertedWith("No unlock found");
    });

    it("Should revert fast redeem with no unlocks", async function () {
      const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);

      await expect(xradersLock.connect(addr1).fastRedeem(0)).to.be.revertedWith("Invalid unlock index");
    });

    it("Should revert fast redeem with invalid index", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      await expect(xradersLock.connect(addr1).fastRedeem(1)).to.be.revertedWith("Invalid unlock index");
    });

    /**
     * only for Mock token
     */
    it("Should revert if transfer fails during fast redeem", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      // Approve and lock tokens
      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      // Unlock some tokens
      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      // Simulate transfer failure
      await token.connect(addr1).setFailTransfer(true);

      // Expect fast redeem to fail due to transfer failure
      await expect(xradersLock.connect(addr1).fastRedeem(0))
        .to.be.revertedWith("Transfer failed");

      // Reset failure flag to avoid affecting other tests
      await token.connect(addr1).setFailTransfer(false);
    });
  });

  describe("Owner-Only Functions", function () {
    it("Should allow owner to set unlock period", async function () {
      const { xradersLock } = await loadFixture(deployXradersLockFixture);

      await xradersLock.setUnlockPeriod(10 * 24 * 60 * 60);
      expect(await xradersLock.unlockPeriod()).to.equal(10 * 24 * 60 * 60);
    });

    it("Should allow owner to set penalty rate", async function () {
      const { xradersLock } = await loadFixture(deployXradersLockFixture);

      await xradersLock.setPenaltyRate(25);
      expect(await xradersLock.penaltyRate()).to.equal(25);
    });

    it("Should revert when non-owner tries to set unlock period", async function () {
      const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);

      await expect(xradersLock.connect(addr1).setUnlockPeriod(10 * 24 * 60 * 60))
        .to.be.revertedWithCustomError(xradersLock, "OwnableUnauthorizedAccount")
        .withArgs(addr1.address);
    });

    it("Should revert when non-owner tries to set penalty rate", async function () {
      const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);

      await expect(xradersLock.connect(addr1).setPenaltyRate(25))
        .to.be.revertedWithCustomError(xradersLock, "OwnableUnauthorizedAccount")
        .withArgs(addr1.address);
    });
  });

  describe("Token Transfer Behavior", function () {
    it("Should revert lock with insufficient allowance", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await expect(xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"))).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientAllowance"
      );
    });

    it("Should revert lock with insufficient balance", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("2000"));
      await expect(xradersLock.connect(addr1).lock(hre.ethers.parseEther("2000"))).to.be.revertedWithCustomError(
        token,
        "ERC20InsufficientBalance"
      );
    });
  });

  describe("Penalty Calculations", function () {
    it("Should correctly apply penalty for fast redeem", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      await xradersLock.setPenaltyRate(10); // Setting penalty rate to 10%

      await xradersLock.connect(addr1).fastRedeem(0);

      const unlocks = await xradersLock.getUserUnlocks(addr1.address);
      expect(unlocks.length).to.equal(0);

      const balance = await token.balanceOf(addr1.address);
      const expectedBalance = hre.ethers.parseEther("945"); // 1000 - 100 + (50 * 10%)
      expect(balance).to.equal(expectedBalance);
    });
  });

  describe("Event Emission", function () {
    it("Should emit Locked event on lock", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await expect(xradersLock.connect(addr1).lock(hre.ethers.parseEther("100")))
        .to.emit(xradersLock, "Locked")
        .withArgs(addr1.address, hre.ethers.parseEther("100"));
    });

    it("Should emit Unlocked event on unlock", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50")))
        .to.emit(xradersLock, "Unlocked")
        .withArgs(addr1.address, hre.ethers.parseEther("50"));
    });

    it("Should emit Redeemed event on redeem", async function () {
      const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      await time.increase(unlockPeriod + 1);

      await expect(xradersLock.connect(addr1).redeem())
        .to.emit(xradersLock, "Redeemed")
        .withArgs(addr1.address, hre.ethers.parseEther("50"));
    });

    it("Should emit FastRedeemed event on fast redeem", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));

      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      await expect(xradersLock.connect(addr1).fastRedeem(0))
        .to.emit(xradersLock, "FastRedeemed")
        .withArgs(addr1.address, hre.ethers.parseEther("40"), hre.ethers.parseEther("10"));
    });
  });

  describe("Multiple Locks and Redeem", function () {
    it("Should redeem multiple unlocks after the unlock period", async function () {
      const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

      // Locking tokens three times
      await token.connect(addr1).approve(xradersLock.getAddress(), hre.ethers.parseEther("600"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("100"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("200"));
      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("200"));
      await xradersLock.connect(addr1).lock(hre.ethers.parseEther("300"));

      // Increase time to pass unlock period for first two locks
      await time.increase(unlockPeriod + 1);

      // Redeem tokens
      await xradersLock.connect(addr1).redeem();

      const unlocks = await xradersLock.getUserUnlocks(addr1.address);
      expect(unlocks.length).to.equal(0);

      const remainingLock = await xradersLock.userLock(addr1.address);
      expect(remainingLock.amount).to.equal(hre.ethers.parseEther("300"));

      const balance = await token.balanceOf(addr1.address);
      const expectedBalance = hre.ethers.parseEther("700"); // 1000 initial - 300 remaining
      expect(balance).to.equal(expectedBalance);
    });
  });
});
