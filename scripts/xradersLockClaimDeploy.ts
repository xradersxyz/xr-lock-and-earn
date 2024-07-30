import { ethers, upgrades } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as dotenv from "dotenv";

const envFile = process.env.NODE_ENV === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  const [deployer] = await ethers.getSigners();
  const initialOwner = process.env.BSC_OWNER as string;
  const tokenAddress = process.env.XR_CONTRACT_ADDRESS as string;

  if (!initialOwner) {
    throw new Error("BSC_OWNER environment variable not set");
  }
  if (!tokenAddress) {
    throw new Error("XR_CONTRACT_ADDRESS environment variable not set");
  }

  const initialRandomClaims = [
    { address: ethers.Wallet.createRandom().address, amount: ethers.parseUnits("100") },
    { address: ethers.Wallet.createRandom().address, amount: ethers.parseUnits("50") },
  ];
  const initialRandomTree = StandardMerkleTree.of(
    initialRandomClaims.map(({ address, amount }) => [address, amount.toString()]),
    ["address", "uint256"]
  );
  const initialMerkleRoot = initialRandomTree.root;

  console.log("Deploying contracts with the account:", deployer.address);

  const XradersLockClaimFactory = await ethers.getContractFactory("XradersLockClaim");

  let xradersLockClaim;
  const deployedAddress = process.env.XRADERS_LOCK_CLAIM_CONTRACT_ADDRESS;
  if(deployedAddress) {
    console.log("Upgrading XradersLockClaim at address:", deployedAddress);
    xradersLockClaim = await upgrades.upgradeProxy(deployedAddress, XradersLockClaimFactory);

    await xradersLockClaim.waitForDeployment();
    console.log(`Upgraded XradersLockClaim contract address : ${await xradersLockClaim.getAddress()}`);
  } else {
    xradersLockClaim = await upgrades.deployProxy(
      XradersLockClaimFactory,
      [initialOwner, initialMerkleRoot],
      { initializer: "initialize" }
    );

    await xradersLockClaim.waitForDeployment();
    console.log(`Deployed XradersLockClaim contract address : ${await xradersLockClaim.getAddress()}`);

    await xradersLockClaim.connectToOtherContracts([tokenAddress]);
    console.log("Connected XrToken contract to XradersLockClaim");
  }
  console.log(
    `npx hardhat verify --network ${(await deployer.provider.getNetwork()).name} ${await xradersLockClaim.getAddress()}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
