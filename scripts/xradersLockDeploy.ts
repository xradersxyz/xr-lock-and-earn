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

  console.log(`Deploying contracts with the account : ${deployer.address}`);
  console.log(`Deploying token address : ${tokenAddress}`);

  const XradersLockFactory = await ethers.getContractFactory("XradersLock");
  
  let xradersLock;
  const deployedAddress = process.env.XRADERS_LOCK_CONTRACT_ADDRESS;
  if(deployedAddress) {
    console.log("Upgrading XradersLock at address:", deployedAddress);
    xradersLock = await upgrades.upgradeProxy(deployedAddress, XradersLockFactory);
  } else {
    xradersLock = await upgrades.deployProxy(
      XradersLockFactory, 
      [initialOwner, unlockPeriod, penaltyRate], 
      {initializer: "initialize",}
    );
  }

  await xradersLock.waitForDeployment();
  console.log(`Deployed XradersLock contract address : ${xradersLock.getAddress()}`);

  if (!xradersLock.isTokenConnected) {
    const setTokenTx = await xradersLock.connectToOtherContracts([tokenAddress]);
    await setTokenTx.wait();
    console.log(`Token contract ${tokenAddress} connected to XradersLock`);
  }
  
  console.log(
    `npx hardhat verify --network ${(await deployer.provider.getNetwork()).name} ${
      xradersLock.getAddress()
    } ${initialOwner} ${unlockPeriod} ${penaltyRate}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
