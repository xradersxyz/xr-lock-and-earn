const { upgrades } = require("hardhat");
import { ethers } from "hardhat";
import * as dotenv from "dotenv";


async function main() {
  const existingProxyAddress = "0xd461EAB05d6e7B602b492725Fb85d93D2461C819"; // 기존 Proxy 주소
  const XradersLockFactory = await ethers.getContractFactory("XradersLock");

  // Force import the existing proxy
  console.log("Registering existing proxy...");
  await upgrades.forceImport(existingProxyAddress, XradersLockFactory);

  // Upgrade the proxy
  console.log("Upgrading the proxy...");
  const upgraded = await upgrades.upgradeProxy(existingProxyAddress, XradersLockFactory);

  console.log("Proxy upgraded at:", upgraded.address);

  const implementationAddress = await upgrades.erc1967.getImplementationAddress(existingProxyAddress);
  console.log("New implementation address:", implementationAddress);
}

// main()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error(error);
//     process.exit(1);
//   });
