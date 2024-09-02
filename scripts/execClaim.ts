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

  const tree = StandardMerkleTree.load(JSON.parse(fs.readFileSync('claim.json', 'utf8')));

  for(const [i, v] of tree.entries()) {
    if(v[0] === deployer.address) {
      const proof = tree.getProof(i);
      console.log('value : ', v);
      console.log('proof : ', proof);

      const isClaimedToday = await xradersLockClaim.isClaimedToday(deployer.getAddress());
      console.log('is claimed today : ', isClaimedToday);

      const unclaimedAmount = await xradersLockClaim.getUnclaimedAmount(deployer.address, v[1], proof);
      console.log('unclaimed amount : ',unclaimedAmount);

      await xradersLockClaim.getClaimedAmount

      if(unclaimedAmount > 0) {
        const claimTx = await xradersLockClaim.claim(v[1], proof);
        const receipt = await claimTx.wait();
        
        console.log('claim tx : ', claimTx);
        console.log('claim receipt : ', receipt);
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });