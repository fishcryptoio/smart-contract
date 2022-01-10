require("@nomiclabs/hardhat-waffle");

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

require('dotenv').config()
require("hardhat-gas-reporter");

module.exports = {
  solidity:  {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 1337
    },
    testnet: {
      url: process.env.TESTNET_NODE_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`,`0x${process.env.PS_PRIVATE_KEY}`],
    },
    mainnet: {
      url: process.env.MAINNET_NODE_URL,
      accounts: [`0x${process.env.PRIVATE_KEY}`,`0x${process.env.PS_PRIVATE_KEY}`]
    },
  },
  gasReporter: {
    currency: 'USD',
    token: 'BNB',
    gasPrice: 5,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY
  }
};
