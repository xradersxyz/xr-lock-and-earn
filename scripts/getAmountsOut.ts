import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const pancakeRouterAddress = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
  const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
  const XRToken = "0x5f78F4BFCb2b43bC174FE16A69a13945CEfA2978";

  const pancakeRouter = await ethers.getContractAt(
    "IUniswapV2Router02",
    pancakeRouterAddress
  );

  const amountIn = ethers.parseUnits("1", 18);
  const path = [XRToken, WBNB];

  try {
    const amountsOut = await pancakeRouter.getAmountsOut(amountIn, path);
    console.log(`amountsOut = ${amountsOut}`);
    console.log(`${ethers.formatUnits(amountsOut[0], 18)} XR = ${ethers.formatUnits(amountsOut[1], 18)} BNB`);
    
    const penaltyAmount = amountsOut[1] * BigInt('142');
    console.log(`142.8 XR = ${ethers.formatUnits(penaltyAmount)} BNB`)
  } catch (error) {
    console.error("Error:", error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});