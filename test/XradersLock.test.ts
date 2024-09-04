import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { time, loadFixture,} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Contract } from "ethers";
import hre, { ethers } from "hardhat";
import { XradersLock, XrToken } from "../typechain-types";

describe("XradersLock", function () {
  // Fixture to deploy the contracts and set up initial state
  async function deployXradersLockFixture() {
    const unlockPeriod = 7 * 24 * 60 * 60; // 7 days in seconds
    const penaltyRate = 20; // 20%
    const treasuryAddress = process.env.XR_TREASURY_ADDRESS as string;
    const mockWETH = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"; // Mock WETH address
    const tokenPriceInWBNB = hre.ethers.parseEther("0.01"); // Mock price: 1 XR = 0.01 WBNB

    // Contracts are deployed using the first signer/account by default
    const [owner, addr1, addr2] = await hre.ethers.getSigners();

    // Deploy XR Token
    const TokenFactory = await hre.ethers.getContractFactory("XrToken");
    const token = await TokenFactory.deploy(owner.address);

    const MockUniswapV2RouterFactory = await hre.ethers.getContractFactory("MockUniswapV2Router");
    const mockRouter = await MockUniswapV2RouterFactory.deploy(
      await token.getAddress(),
      mockWETH,
      tokenPriceInWBNB,
      mockWETH,
      hre.ethers.ZeroAddress
    );

    // Deploy XradersLock Contract
    const XradersLockFactory = await hre.ethers.getContractFactory(
      "XradersLock"
    );
    const xradersLock = await XradersLockFactory.deploy();
    await xradersLock.initialize(
      owner.address,
      unlockPeriod,
      penaltyRate,
      treasuryAddress
    );

    // Connect XradersLock contract to Token
    await xradersLock.setPancakeRouter(await mockRouter.getAddress());
    await xradersLock.connectToOtherContracts([token.getAddress()]);

    // Distribute tokens
    await token.transfer(addr1.address, hre.ethers.parseEther("1000"));
    await token.transfer(addr2.address, hre.ethers.parseEther("1000"));

    return {
      xradersLock,
      token,
      unlockPeriod,
      penaltyRate,
      owner,
      treasuryAddress,
      addr1,
      addr2,
    };
  }

  async function signPermit(
    addr: HardhatEthersSigner,
    token: XrToken,
    xradersLock: XradersLock,
    amount: bigint
  ) {
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
    it("Should set the correct unlockPeriod, penaltyRate and tresuryAddress", async function () {
      const { xradersLock, unlockPeriod, penaltyRate, treasuryAddress } = await loadFixture(
        deployXradersLockFixture
      );

      expect(await xradersLock.unlockPeriod()).to.equal(unlockPeriod);
      expect(await xradersLock.penaltyRate()).to.equal(penaltyRate);
      expect(await xradersLock.treasuryAddress()).to.equal(treasuryAddress);
    });
  });

  describe("Locking Tokens", function () {
    it("Should lock whole tokens successfully", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);
  
      const amount = hre.ethers.parseUnits("100"); // 100 tokens
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);
  
      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
  
      const lock = await xradersLock.userLock(addr1.address);
      expect(lock.amount).to.equal(amount);
    });
  
    it("Should fail to lock fractional tokens", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);
  
      const fractionalAmount = hre.ethers.parseUnits("100.5"); // 100.5 tokens
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, fractionalAmount);
  
      await expect(xradersLock.connect(addr1).lock(fractionalAmount, deadline, v, r, s))
        .to.be.revertedWith("Amount must be a whole number of tokens");
    });
  
    it("Should fail to lock zero tokens", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);
  
      const zeroAmount = hre.ethers.parseUnits("0"); // 0 tokens
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, zeroAmount);
  
      await expect(xradersLock.connect(addr1).lock(zeroAmount, deadline, v, r, s))
        .to.be.revertedWith("Amount must be greater than 0");
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

      await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("0")))
        .to.be.revertedWith("Invalid unlock amount");
    });

    it("Should not unlock more tokens than locked", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

      await expect(xradersLock.connect(addr1).unlock(hre.ethers.parseEther("200")))
        .to.be.revertedWith("Invalid unlock amount");
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

    it("Should fast redeem tokens with penalty", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));
      await xradersLock.connect(addr1).fastRedeem(0);

      const unlocks = await xradersLock.getUserUnlocks(addr1.address);
      expect(unlocks.length).to.equal(0);

      const balance = await token.balanceOf(addr1.address);
      const expectedBalance = hre.ethers.parseEther("940");
      expect(balance).to.equal(expectedBalance);
    });

    it("Should fast redeem tokens with BNB penalty", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      const bnbPenalty = await xradersLock.connect(addr1).getPenaltyAmountInBNB(0);

      await expect(xradersLock.connect(addr1).fastRedeemInBNB(0, { value: bnbPenalty }))
        .to.emit(xradersLock, "PenaltyPaidInBNB");
    });

    it("Should revert redeem with no unlocks", async function () {
      const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);

      await expect(xradersLock.connect(addr1).redeem())
        .to.be.revertedWith("No unlock found");
    });

    it("Should revert fast redeem with no unlocks", async function () {
      const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);

      await expect(xradersLock.connect(addr1).fastRedeem(0))
        .to.be.revertedWith("Invalid unlock index");
    });

    it("Should revert fast redeem with invalid index", async function () {
      const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

      const amount = hre.ethers.parseUnits("100");
      const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

      await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
      await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

      await expect(xradersLock.connect(addr1).fastRedeem(1))
        .to.be.revertedWith("Invalid unlock index");
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

      it("Should allow owner to set treasury address", async function () {
        const { xradersLock, owner } = await loadFixture(deployXradersLockFixture);
  
        const newTreasuryAddress = owner.address;  // Assume the owner sets themselves as treasury for this test
        await xradersLock.setTreasuryAddress(newTreasuryAddress);
        expect(await xradersLock.treasuryAddress()).to.equal(newTreasuryAddress);
      });

      it("Should allow owner to set PancakeRouter address", async function () {
        const { xradersLock, owner } = await loadFixture(deployXradersLockFixture);
  
        const newRouterAddress = owner.address;  // Using owner's address just for testing
        await xradersLock.setPancakeRouter(newRouterAddress);
        expect(await xradersLock.pancakeRouter()).to.equal(newRouterAddress);
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
  
      it("Should revert when non-owner tries to set treasury address", async function () {
        const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);
  
        await expect(xradersLock.connect(addr1).setTreasuryAddress(addr1.address))
          .to.be.revertedWithCustomError(xradersLock, "OwnableUnauthorizedAccount")
          .withArgs(addr1.address);
      });
  
      it("Should revert when non-owner tries to set PancakeRouter address", async function () {
        const { xradersLock, addr1 } = await loadFixture(deployXradersLockFixture);
  
        await expect(xradersLock.connect(addr1).setPancakeRouter(addr1.address))
          .to.be.revertedWithCustomError(xradersLock, "OwnableUnauthorizedAccount")
          .withArgs(addr1.address);
      });
    });

    describe("Token Transfer Behavior", function () {
      it("Should revert lock with insufficient balance", async function () {
        const { xradersLock, token, addr1 } = await loadFixture(deployXradersLockFixture);

        const amount = hre.ethers.parseUnits("2000");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await expect(xradersLock.connect(addr1).lock(amount, deadline, v, r, s))
          .to.be.revertedWithCustomError(token, "ERC20InsufficientBalance")
          .withArgs(addr1.address, hre.ethers.parseUnits("1000"), amount);
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
        const { xradersLock, token, addr1 } = await loadFixture(
          deployXradersLockFixture
        );

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await expect(xradersLock.connect(addr1).lock(amount, deadline, v, r, s))
          .to.emit(xradersLock, "Locked")
          .withArgs(addr1.address, hre.ethers.parseEther("100"));
      });

      it("Should emit Unlocked event on unlock", async function () {
        const { xradersLock, token, addr1 } = await loadFixture(
          deployXradersLockFixture
        );

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

        await expect(
          xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"))
        )
          .to.emit(xradersLock, "Unlocked")
          .withArgs(addr1.address, hre.ethers.parseEther("50"));
      });

      it("Should emit Redeemed event on redeem", async function () {
        const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(
          deployXradersLockFixture
        );

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
        const { xradersLock, token, addr1 } = await loadFixture(
          deployXradersLockFixture
        );

        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);

        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);

        await xradersLock.connect(addr1).unlock(hre.ethers.parseEther("50"));

        await expect(xradersLock.connect(addr1).fastRedeem(0))
          .to.emit(xradersLock, "FastRedeemed")
          .withArgs(
            addr1.address,
            hre.ethers.parseEther("40"),
            hre.ethers.parseEther("10")
          );
      });
    });

    describe("Penalty Rate Reduction Over Time", function () {
      it("Should correctly calculate penalty rate reduction each day", async function () {
        const { xradersLock, token, addr1, unlockPeriod } = await loadFixture(deployXradersLockFixture);

        const totalHours = BigInt(Math.ceil(unlockPeriod / (60 * 60))); // Total days in the unlock period
        const amount = hre.ethers.parseUnits("100");
        const { deadline, v, r, s } = await signPermit(addr1, token, xradersLock, amount);
    
        await xradersLock.connect(addr1).lock(amount, deadline, v, r, s);
        await xradersLock.connect(addr1).unlock(amount);
    
        // Initial penalty rate
        let initialPenaltyRate = await xradersLock.getCurrentPenaltyRate((await time.latest()) + unlockPeriod);
        console.log(`Initial Penalty Rate: ${initialPenaltyRate}%`);
    
        for (let hour = 1; hour <= totalHours; hour++) {
          // Increase time by one day
          await time.increase(60 * 60);
  
          // Calculate expected penalty rate after each day
          // Calculate expected penalty rate after each day using rounding up
          const elapsedDays = BigInt(hour);
          const timePercentElapsed = Math.floor((Number(elapsedDays) * 100) / Number(totalHours));
          const reducedPenaltyRate = Math.floor((Number(initialPenaltyRate) * timePercentElapsed) / 100);
          const expectedPenaltyRate = Number(initialPenaltyRate) - reducedPenaltyRate;
    
          // Fetch current penalty rate from the contract
          const currentPenaltyRate = await xradersLock.getCurrentPenaltyRate(
            (await time.latest()) + unlockPeriod - hour * 60 * 60
          );
          const currentPenaltyAmount = await xradersLock.connect(addr1).getPenaltyAmountInBNB(0);
    
          console.log(`Hour ${hour}: penalty Rate : ${currentPenaltyRate}%, penalty amount : ${ethers.formatUnits(currentPenaltyAmount)}`);

          // Check if the current penalty rate matches the expected penalty rate
          expect(currentPenaltyRate).to.equal(expectedPenaltyRate);
        }
      });
    });
  });
});
