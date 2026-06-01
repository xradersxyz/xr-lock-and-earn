import { ethers, upgrades } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });
console.log(`Using env: ${envFile}`);

const PROXY_ADDRESS = "0x143D5761702a6c542d9BEcB6462716EB9Af19DBD";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const prevImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("Current implementation:", prevImplAddress);

  // hardhat-upgrades manifest 우회 — 구현체 직접 배포
  console.log("Deploying new implementation directly...");
  const XradersLockFactory = await ethers.getContractFactory("XradersLock");
  const newImpl = await XradersLockFactory.deploy();
  await newImpl.waitForDeployment();
  const newImplAddress = await newImpl.getAddress();
  console.log("New implementation deployed:", newImplAddress);

  // ProxyAdmin 주소 확인
  const proxyAdminAddress = await upgrades.erc1967.getAdminAddress(PROXY_ADDRESS);
  console.log("ProxyAdmin address:", proxyAdminAddress);

  // OZ v4: upgrade(proxy, impl) / OZ v5: upgradeAndCall(proxy, impl, data)
  // UPGRADE_INTERFACE_VERSION() 으로 버전 감지
  let upgradeTx;
  try {
    const proxyAdminV5 = await ethers.getContractAt(
      [
        "function UPGRADE_INTERFACE_VERSION() external view returns (string)",
        "function upgradeAndCall(address proxy, address implementation, bytes calldata data) external payable",
      ],
      proxyAdminAddress
    );
    const version = await proxyAdminV5.UPGRADE_INTERFACE_VERSION();
    console.log("ProxyAdmin version:", version);
    upgradeTx = await proxyAdminV5.upgradeAndCall(PROXY_ADDRESS, newImplAddress, "0x");
  } catch {
    console.log("OZ v5 ProxyAdmin not detected, trying OZ v4...");
    const proxyAdminV4 = await ethers.getContractAt(
      ["function upgrade(address proxy, address implementation) external"],
      proxyAdminAddress
    );
    upgradeTx = await proxyAdminV4.upgrade(PROXY_ADDRESS, newImplAddress);
  }

  await upgradeTx.wait();
  console.log("Upgrade tx:", upgradeTx.hash);

  const confirmedImplAddress = await upgrades.erc1967.getImplementationAddress(PROXY_ADDRESS);
  console.log("Confirmed implementation:", confirmedImplAddress);
  console.log("Implementation changed:", prevImplAddress !== confirmedImplAddress ? "YES" : "NO (same)");

  const contract = await ethers.getContractAt("XradersLock", PROXY_ADDRESS);

  const active = await contract.active();
  console.log("active flag:           ", active, "(expected: false)");

  const tokenAddress = await contract.token();
  const token = await ethers.getContractAt("IERC20", tokenAddress);
  const balance = await token.balanceOf(PROXY_ADDRESS);
  console.log("XR balance in contract:", ethers.formatEther(balance), "XR");

  if (active) {
    console.warn("WARNING: active is true — all write functions are still open!");
  } else {
    console.log("All user write functions are blocked.");
  }

  const network = await deployer.provider.getNetwork();
  console.log(`\nnpx hardhat verify --network ${network.name} ${newImplAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
