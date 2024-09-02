import { ethers } from "hardhat";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import * as dotenv from "dotenv";
import fs from "fs";

const env = process.env.NODE_ENV as string;
const envFile = env === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

async function main() {
  const [deployer] = await ethers.getSigners();
  
  const contracAddress = process.env.XRADERS_LOCK_CLAIM_CONTRACT_ADDRESS as string;
  
  const xradersLockClaim = await ethers.getContractAt("XradersLockClaim", contracAddress);

  const modifiedClaims = [
    { address: '0x96fD83D8c091f2C08b3D2138721A1D9e937b463A', amount: ethers.parseUnits("10") },
    { address: '0x41D9Bd1927Ac229A896D861B7446258eA8637d18', amount: ethers.parseUnits("20") },
    { address: '0x2F880eEFc0aAD82b8935a6Db2f63723a554ea482', amount: ethers.parseUnits("30") },
    { address: '0xe2593666215FdF2D93298aB9A063C3084Dc5979a', amount: ethers.parseUnits("10.001") },
    { address: '0x10E6C02239f22c26B2fA03e5B6f5461cdA46bd45', amount: ethers.parseUnits("10.002") },
    { address: '0x435b880749945053CF52Fd07DfBfDD72d7332739', amount: ethers.parseUnits("10.003") },
    { address: '0x830D4d7c393f5d4622E7102E0CE20495A0FD8799', amount: ethers.parseUnits("10.004") },
    { address: '0x536cE86c0dD96fdF9A3de5deAA063d9508D2F8A9', amount: ethers.parseUnits("10.005") },
    { address: '0x6e09A9D93cC04162b72AD00B8cBc012C667BC778', amount: ethers.parseUnits("10.006") },
    { address: '0x198f19eAB39C77FBAa20eFb14D7038139Bc8eE7a', amount: ethers.parseUnits("10.007") },
    { address: '0x0107a159A931B94a4e2c01678cd0BA6983Aa34B5', amount: ethers.parseUnits("10.008") },
    { address: '0xd32FE7A95A2151eDe9af9cd5b2ABfBcAc333BDa6', amount: ethers.parseUnits("10.009") },
    { address: '0xf93a78675Ab9EE9f4A28B0e6C621015f6dEF6Ae3', amount: ethers.parseUnits("10.01") },
    { address: '0x2bDAa0279Fa42B7ecCAd1728291F6691e8F9c6e9', amount: ethers.parseUnits("10.011") },
    { address: '0x989ab80976f851a7d2fC033d206E85468B69408C', amount: ethers.parseUnits("10.012") },
  ];
  const modifiedTree = StandardMerkleTree.of(
    modifiedClaims.map(({ address, amount }) => [address, amount.toString()]),
    ["address", "uint256"]
  );
  const modifiedMerkleRoot = modifiedTree.root;
  console.log('root - ', modifiedMerkleRoot);

  await xradersLockClaim.pause().then(tx => tx.wait());

  const tx = await xradersLockClaim.updateMerkleRoot(modifiedMerkleRoot);
  const receipt = await tx.wait();

  await xradersLockClaim.unpause().then(tx => tx.wait());
  
  console.log('updateMerkleRoot tx : ', tx);
  console.log('receipt : ', receipt);

  fs.writeFileSync('claim.json', JSON.stringify(modifiedTree.dump()));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });