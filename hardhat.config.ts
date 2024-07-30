import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";

const envFile = process.env.NODE_ENV === "mainnet" ? ".env-main" : ".env-test";
dotenv.config({ path: envFile });

const { PRIVATE_KEY, BSCSCAN_API_URL, BSCSCAN_API_KEY, NODEREAL_RPC_URL, NODEREAL_API_KEY } = process.env;


const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          metadata: {
            bytecodeHash: "none",
          },
          // Disable the optimizer when debugging
          optimizer: {
            enabled: true,
            runs: 800,
          },
        },
      },
    ],
  },
  networks: {
    mainnet: {
      url: `${NODEREAL_RPC_URL}${NODEREAL_API_KEY}`,
      accounts: [`0x${PRIVATE_KEY}`],
    },
    testnet: {
      url: `${NODEREAL_RPC_URL}${NODEREAL_API_KEY}`,
      accounts: [`0x${PRIVATE_KEY}`],
    },
  },
  etherscan: {
    apiKey: {
      mainnet: BSCSCAN_API_KEY as string,
      testnet: BSCSCAN_API_KEY as string,
    },
    customChains: [
      {
        network: "testnet",
        chainId: 97,
        urls: {
          apiURL: BSCSCAN_API_URL as any,
          browserURL: process.env.BSCSCAN_BROWSER_URL as any,
        },
      },
    ],
  },
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
};

export default config;
