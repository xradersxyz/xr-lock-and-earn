import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  console.log(`Deploying on ${env}`);

  const [deployer] = await ethers.getSigners();
  const initialOwner = process.env.BSC_OWNER as string;
  const tokenAddress = process.env.XR_CONTRACT_ADDRESS as string;

  if (!initialOwner) {
    throw new Error("BSC_OWNER environment variable not set");
  }
  if (!tokenAddress) {
    throw new Error("XR_CONTRACT_ADDRESS environment variable not set");
  }

  const unlockPeriod = 7 * 24 * 60 * 60; // 7 days in seconds
  const penaltyRate = 20; // 20%
  const treasuryAddress = process.env.XR_TREASURY_ADDRESS as string;
  const pancakeRouterAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

  console.log(`Deploying contracts with the account : ${deployer.address}`);
  console.log(`Deploying token address : ${tokenAddress}`);

  const XradersLockFactory = await ethers.getContractFactory("XradersLock");

  let xradersLock;
  const deployedAddress = process.env.XRADERS_LOCK_CONTRACT_ADDRESS;
  if (deployedAddress) {
    console.log("Upgrading XradersLock at address:", deployedAddress);
    xradersLock = await upgrades.upgradeProxy(
      deployedAddress,
      XradersLockFactory
    );
  } else {
    xradersLock = await upgrades.deployProxy(
      XradersLockFactory,
      [initialOwner, unlockPeriod, penaltyRate, treasuryAddress, pancakeRouterAddress],
      {
        initializer: "initialize",
      }
    );
  }

  await xradersLock.waitForDeployment();
  console.log(`Deployed XradersLock contract address : ${await xradersLock.getAddress()}`);

  await xradersLock.setPancakeRouter(pancakeRouterAddress);
  console.log(`Pancake router address : ${pancakeRouterAddress}`);

  const setTokenTx = await xradersLock.connectToOtherContracts([tokenAddress]);
  await setTokenTx.wait();
  console.log(`Token contract ${tokenAddress} connected to XradersLock`);

  console.log(
    `npx hardhat verify --network ${
      (await deployer.provider.getNetwork()).name
    } ${await xradersLock.getAddress()}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
