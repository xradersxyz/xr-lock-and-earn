import { ethers } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  const [deployer] = await ethers.getSigners();

  const contracAddress = process.env.XRADERS_LOCK_CONTRACT_ADDRESS as string;
  // const tokenAddress = process.env.XR_CONTRACT_ADDRESS as string;

  const xradersLock = await ethers.getContractAt("XradersLock", contracAddress);
  // const XrToken = await ethers.getContractAt("XrToken", tokenAddress);

  const checkinAmountInBnb = await xradersLock.getCheckinAmountInBNB(0);
  console.log(`CheckIn Amount in BNB: ${checkinAmountInBnb}`);

  // const lockAmount = ethers.parseUnits("100", 18);
  // const nonce = await XrToken.nonces(deployer.address);
  // const deadline = Math.floor(Date.now() / 1000) + 60 * 60;

  const checkInTx = await xradersLock.checkIn(
    [deployer.getAddress(), deployer.getAddress()],
    1234567892,
    { value: checkinAmountInBnb }
  );
  const receipt = await checkInTx.wait();

  console.log("Check in tx : ", checkInTx);
  console.log("Check in receipt : ", receipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
