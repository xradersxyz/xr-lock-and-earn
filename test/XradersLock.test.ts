import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time, loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Contract } from "ethers";
import hre from "hardhat";
import { XradersLock, XrToken } from "../typechain-types";

describe("XradersLock", function () {
  // Fixture to deploy the contracts and set up initial state
  async function deployXradersLockFixture() {
    const unlockPeriod = 7 * 24 * 60 * 60; // 7 days in seconds
    const penaltyRate = 20; // 20%

    // Contracts are deployed using the first signer/account by default
    const [owner, addr1, addr2] = await hre.ethers.getSigners();

    // Deploy XR Token
    const TokenFactory = await hre.ethers.getContractFactory("XrToken");
    const token = await TokenFactory.deploy(owner.address);

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

  async function signPermit(addr: HardhatEthersSigner, token: XrToken, xradersLock: XradersLock, amount: bigint) {
    const nonce = await token.nonces(addr.address);
    const deadline = Math.floor(Date.now() / 1000) + 60 * 60;

    const domain = {
      name: await token.name(),
      version: "1",
      chainId: (await hre.ethers.provider.getNetwork()).chainId,
      verifyingContract: await token.getAddress(),
    };

    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const values = {
      owner: addr.address,
      spender: await xradersLock.getAddress(),
      value: amount,
      nonce: nonce,
      deadline: deadline,
    };

    const signature = await addr.signTypedData(domain, types, values);
    const { v, r, s } = hre.ethers.Signature.from(signature);

    return { amount, deadline, v, r, s };
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

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

      const lock = await xradersLock.userLock(addr1.address);
      expect(lock.amount).to.equal(amount);
    });
  });

  describe("Unlocking Tokens", function () {
    it("Should unlock tokens", async function () {
      const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
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

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

      await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("0"))).to.be.revertedWith(
        "Invalid unlock amount"
      );
    });

    it("Should not unlock more tokens than locked", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

      await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("200"))).to.be.revertedWith(
        "Invalid unlock amount"
      );
    });
  });

  describe("Redeeming Tokens", function () {
    it("Should redeem tokens after unlock period", async function () {
      const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

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

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
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

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      await expect(xradersLock.connect(addr1).fastRedeem(1)).to.be.revertedWith("Invalid unlock index");
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
      it("Should revert lock with insufficient balance", async function () {
        const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

        const amount = hre.ethers.parseUnits("2000");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
        await expect(xradersLock.connect(addr1).lock(amount, deadline, v, r, s)).to.be.revertedWithCustomError(
          token,
          "ERC20InsufficientBalance"
        ).withArgs(addr1.address, hre.ethers.parseUnits("1000"), amount);
        
      });
    });

    describe("Penalty Calculations", function () {
      it("Should correctly apply penalty for fast redeem", async function () {
        const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
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

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await expect(xradersLock.connect(addr1).lock(amount, deadline, v, r, s))
          .to.emit(xradersLock, "Locked")
          .withArgs(addr1.address, hre.ethers.parseEther("100"));
      });

      it("Should emit Unlocked event on unlock", async function () {
        const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

        await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50")))
          .to.emit(xradersLock, "Unlocked")
          .withArgs(addr1.address, hre.ethers.parseEther("50"));
      });

      it("Should emit Redeemed event on redeem", async function () {
        const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

        await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

        await time.increase(unlockPeriod + 1);

        await expect(xradersLock.connect(addr1).redeem())
          .to.emit(xradersLock, "Redeemed")
          .withArgs(addr1.address, hre.ethers.parseEther("50"));
      });

      it("Should emit FastRedeemed event on fast redeem", async function () {
        const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

        await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

        await expect(xradersLock.connect(addr1).fastRedeem(0))
          .to.emit(xradersLock, "FastRedeemed")
          .withArgs(addr1.address, hre.ethers.parseEther("40"), hre.ethers.parseEther("10"));
      });
    });
  });
});
