import { ethers } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const contracAddress = process.env.XRADERS_LOCK_CONTRACT_ADDRESS as string;
  
  const xradersLock = await ethers.getContractAt("XradersLock", contracAddress);

  const unlockPeriod = 24 * 60 * 60;
  const tx = await xradersLock.setUnlockPeriod(unlockPeriod);
  const txReceipt = await tx.wait();
  
  console.log('setUnlockPeriod tx : ', tx);
  console.log('receipt : ', txReceipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });