import { ethers } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  const [deployer] = await ethers.getSigners();
  const contracAddress = process.env.XRADERS_LOCK_CONTRACT_ADDRESS as string;
  const xradersLock = await ethers.getContractAt("XradersLock", contracAddress);

  const redeemableAmount = await xradersLock.getRedeeambleAmount(deployer.address);
  console.log(`Redeemable Amount : ${redeemableAmount}`);

  const fastReedemTx = await xradersLock.fastRedeem(0, false);
  const receipt = await fastReedemTx.wait();

  console.log('redeem tx : ', fastReedemTx);
  console.log('redeem receipt : ', receipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });