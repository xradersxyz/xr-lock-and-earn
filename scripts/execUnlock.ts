import { ethers } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const contracAddress = process.env.XRADERS_LOCK_CONTRACT_ADDRESS as string;
  const xradersLock = await ethers.getContractAt("XradersLock", contracAddress);

  const totalLockedAmount = await xradersLock.getTotalLockedAmount(deployer.address);
  console.log(`total Locked Amount : ${totalLockedAmount}`);

  const userUnlocks = await xradersLock.getUserUnlocks(deployer.address);
  console.log(`User Unlocks : ${ethers.formatUnits(userUnlocks[0][0], 18)}`);

  const redeemableAmount = await xradersLock.getRedeeambleAmount(deployer.address);
  console.log(`Redeemable Amount : ${redeemableAmount}`);

  const penaltyAmount = await xradersLock.getPenaltyAmountInBNB(0);
  console.log(`penalty bnb amount : ${ethers.formatUnits(penaltyAmount, 18)}`);

  const unlockTx = await xradersLock.unlock(ethers.parseUnits("100", 18));
  const receipt = await unlockTx.wait();
  
  console.log('unlock tx : ', unlockTx);
  console.log('unlock receipt : ', receipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });