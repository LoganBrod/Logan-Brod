const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const LockboxWallet = await ethers.getContractFactory("LockboxWallet");
  const lockbox = await LockboxWallet.deploy();
  await lockbox.waitForDeployment();

  const address = await lockbox.getAddress();
  console.log("LockboxWallet deployed to:", address);

  // Write address to frontend config
  const fs = require("fs");
  const config = { contractAddress: address };
  fs.writeFileSync(
    "./frontend/src/contractAddress.json",
    JSON.stringify(config, null, 2)
  );
  console.log("Contract address written to frontend/src/contractAddress.json");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
