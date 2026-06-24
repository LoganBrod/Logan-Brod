const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("LockboxWallet", function () {
  let lockbox;
  let owner, user1, user2;
  const ONE_HOUR = 3600;
  const ONE_DAY = 86400;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    const LockboxWallet = await ethers.getContractFactory("LockboxWallet");
    lockbox = await LockboxWallet.deploy();
  });

  describe("ETH locking", function () {
    it("locks ETH and emits event", async function () {
      const amount = ethers.parseEther("1.0");
      const tx = await lockbox.connect(user1).lockETH(ONE_DAY, { value: amount });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(lockbox, "ETHLocked")
        .withArgs(user1.address, 0, amount, block.timestamp + ONE_DAY);

      expect(await lockbox.getETHLockCount(user1.address)).to.equal(1);
    });

    it("rejects zero ETH", async function () {
      await expect(
        lockbox.connect(user1).lockETH(ONE_DAY, { value: 0 })
      ).to.be.revertedWith("Must send ETH");
    });

    it("rejects lock shorter than 1 hour", async function () {
      await expect(
        lockbox.connect(user1).lockETH(3599, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Lock too short");
    });

    it("rejects lock longer than 1 year", async function () {
      await expect(
        lockbox.connect(user1).lockETH(365 * ONE_DAY + 1, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Lock too long");
    });

    it("cannot withdraw before unlock time", async function () {
      await lockbox.connect(user1).lockETH(ONE_DAY, { value: ethers.parseEther("1") });
      await expect(lockbox.connect(user1).withdrawETH(0)).to.be.revertedWith("Still locked");
    });

    it("withdraws after unlock time", async function () {
      const amount = ethers.parseEther("1.0");
      await lockbox.connect(user1).lockETH(ONE_DAY, { value: amount });

      await time.increase(ONE_DAY);

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      const tx = await lockbox.connect(user1).withdrawETH(0);
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * tx.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore + gasCost).to.equal(amount);
    });

    it("cannot withdraw twice", async function () {
      await lockbox.connect(user1).lockETH(ONE_HOUR, { value: ethers.parseEther("1") });
      await time.increase(ONE_HOUR);
      await lockbox.connect(user1).withdrawETH(0);
      await expect(lockbox.connect(user1).withdrawETH(0)).to.be.revertedWith("Already withdrawn");
    });

    it("extends a lock", async function () {
      await lockbox.connect(user1).lockETH(ONE_DAY, { value: ethers.parseEther("1") });
      await lockbox.connect(user1).extendETHLock(0, ONE_DAY);

      await time.increase(ONE_DAY);
      await expect(lockbox.connect(user1).withdrawETH(0)).to.be.revertedWith("Still locked");

      await time.increase(ONE_DAY);
      await expect(lockbox.connect(user1).withdrawETH(0)).to.not.be.reverted;
    });

    it("tops up ETH in existing lock", async function () {
      await lockbox.connect(user1).lockETH(ONE_DAY, { value: ethers.parseEther("1") });
      await lockbox.connect(user1).topUpETH(0, { value: ethers.parseEther("0.5") });

      const lock = await lockbox.getETHLock(user1.address, 0);
      expect(lock.amount).to.equal(ethers.parseEther("1.5"));
    });

    it("getTimeRemaining returns 0 after unlock", async function () {
      await lockbox.connect(user1).lockETH(ONE_HOUR, { value: ethers.parseEther("1") });
      await time.increase(ONE_HOUR);
      expect(await lockbox.getTimeRemaining(user1.address, 0)).to.equal(0);
    });

    it("multiple users lock independently", async function () {
      await lockbox.connect(user1).lockETH(ONE_DAY, { value: ethers.parseEther("1") });
      await lockbox.connect(user2).lockETH(ONE_HOUR, { value: ethers.parseEther("2") });

      await time.increase(ONE_HOUR);
      // user2 can withdraw, user1 cannot
      await expect(lockbox.connect(user2).withdrawETH(0)).to.not.be.reverted;
      await expect(lockbox.connect(user1).withdrawETH(0)).to.be.revertedWith("Still locked");
    });
  });
});
