import { ethers } from "hardhat";
import * as dotenv from "dotenv";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  const [deployer] = await ethers.getSigners();

  const contracAddress = process.env.XRADERS_LOCK_CONTRACT_ADDRESS as string;
  const tokenAddress = process.env.XR_CONTRACT_ADDRESS as string;

  const xradersLock = await ethers.getContractAt("XradersLock", contracAddress);
  const XrToken = await ethers.getContractAt("XrToken", tokenAddress);

  const balance = await XrToken.balanceOf(deployer.address);
  console.log(`Deployer balance: ${ethers.formatUnits(balance, 18)} XR`);

  const lockAmount = ethers.parseUnits("100", 18);
  const nonce = await XrToken.nonces(deployer.address);
  const deadline = Math.floor(Date.now() / 1000) + 60 * 60;

  const network = await ethers.provider.getNetwork();
  const chainId = network.chainId;

  const domain = {
    name: await XrToken.name(),
    version: "1",
    chainId: chainId,
    verifyingContract: await XrToken.getAddress(),
  };

  const types = {
    Permit: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  const values = {
    owner: deployer.address,
    spender: await xradersLock.getAddress(),
    value: lockAmount,
    nonce: nonce,
    deadline: deadline,
  };

  const signature = await deployer.signTypedData(domain, types, values);
  const { v, r, s } = ethers.Signature.from(signature);

  const lockTx = await xradersLock.lock(lockAmount, deadline, v, r, s);
  const receipt = await lockTx.wait();
  console.log('lock tx : ', lockTx);
  console.log('lock receipt : ', receipt);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
