import { ethers } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });
console.log(`Using env: ${envFile}`);

const PROXY_ADDRESS = "0x143D5761702a6c542d9BEcB6462716EB9Af19DBD";
const WITHDRAW_TO = "0x0dec40bd6b4f130b2ce54fce2ae7546f8b2f4713";

async function main() {
  const contract = await ethers.getContractAt("XradersLock", PROXY_ADDRESS);

  const tokenAddress = await contract.token();
  const token = await ethers.getContractAt("IERC20", tokenAddress);
  const balance = await token.balanceOf(PROXY_ADDRESS);
  console.log("Contract XR balance:", ethers.formatEther(balance), "XR");

  console.log(`Calling emergencyWithdraw to ${WITHDRAW_TO}...`);
  const tx = await contract.emergencyWithdraw(WITHDRAW_TO);
  await tx.wait();

  const afterBalance = await token.balanceOf(PROXY_ADDRESS);
  console.log("Remaining XR balance:", ethers.formatEther(afterBalance), "XR");
  console.log("Tx hash:", tx.hash);
  console.log("BSCScan:", `https://bscscan.com/tx/${tx.hash}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
