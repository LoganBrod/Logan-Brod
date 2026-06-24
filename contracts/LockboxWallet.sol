// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LockboxWallet
 * @notice Time-lock wallet for crypto gamblers. Funds are locked until a
 *         user-chosen unlock time and CANNOT be withdrawn early — not even
 *         by the owner. Use this to keep yourself out of your own funds
 *         during a gambling session.
 */
contract LockboxWallet is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Lock {
        uint256 amount;
        uint256 unlockTime;
        bool withdrawn;
    }

    // ETH locks: user => array of locks
    mapping(address => Lock[]) public ethLocks;

    // ERC-20 locks: user => token => array of locks
    mapping(address => mapping(address => Lock[])) public tokenLocks;

    // Minimum lock duration: 1 hour
    uint256 public constant MIN_LOCK_DURATION = 1 hours;

    // Maximum lock duration: 1 year
    uint256 public constant MAX_LOCK_DURATION = 365 days;

    event ETHLocked(address indexed user, uint256 indexed lockId, uint256 amount, uint256 unlockTime);
    event ETHWithdrawn(address indexed user, uint256 indexed lockId, uint256 amount);
    event TokenLocked(address indexed user, address indexed token, uint256 indexed lockId, uint256 amount, uint256 unlockTime);
    event TokenWithdrawn(address indexed user, address indexed token, uint256 indexed lockId, uint256 amount);

    // -------------------------------------------------------------------------
    // ETH
    // -------------------------------------------------------------------------

    /**
     * @notice Lock ETH for a given duration (in seconds).
     * @param duration Seconds to lock, between MIN_LOCK_DURATION and MAX_LOCK_DURATION.
     * @return lockId Index of the new lock in the caller's lock array.
     */
    function lockETH(uint256 duration) external payable nonReentrant returns (uint256 lockId) {
        require(msg.value > 0, "Must send ETH");
        require(duration >= MIN_LOCK_DURATION, "Lock too short");
        require(duration <= MAX_LOCK_DURATION, "Lock too long");

        uint256 unlockTime = block.timestamp + duration;
        lockId = ethLocks[msg.sender].length;

        ethLocks[msg.sender].push(Lock({
            amount: msg.value,
            unlockTime: unlockTime,
            withdrawn: false
        }));

        emit ETHLocked(msg.sender, lockId, msg.value, unlockTime);
    }

    /**
     * @notice Withdraw ETH from a lock once the unlock time has passed.
     */
    function withdrawETH(uint256 lockId) external nonReentrant {
        Lock storage lock = _getEthLock(msg.sender, lockId);
        require(block.timestamp >= lock.unlockTime, "Still locked");
        require(!lock.withdrawn, "Already withdrawn");

        lock.withdrawn = true;
        uint256 amount = lock.amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "Transfer failed");

        emit ETHWithdrawn(msg.sender, lockId, amount);
    }

    /**
     * @notice Extend an existing ETH lock by adding more duration.
     *         Locks can only be extended, never shortened.
     */
    function extendETHLock(uint256 lockId, uint256 additionalDuration) external {
        require(additionalDuration > 0, "No extension");
        Lock storage lock = _getEthLock(msg.sender, lockId);
        require(!lock.withdrawn, "Already withdrawn");

        uint256 newUnlockTime = lock.unlockTime + additionalDuration;
        require(newUnlockTime <= block.timestamp + MAX_LOCK_DURATION, "Exceeds max duration");
        lock.unlockTime = newUnlockTime;
    }

    /**
     * @notice Add more ETH to an existing, non-withdrawn lock.
     *         Lock time is preserved; only amount grows.
     */
    function topUpETH(uint256 lockId) external payable nonReentrant {
        require(msg.value > 0, "Must send ETH");
        Lock storage lock = _getEthLock(msg.sender, lockId);
        require(!lock.withdrawn, "Already withdrawn");
        lock.amount += msg.value;
    }

    // -------------------------------------------------------------------------
    // ERC-20
    // -------------------------------------------------------------------------

    /**
     * @notice Lock ERC-20 tokens for a given duration.
     *         Caller must approve this contract first.
     */
    function lockToken(address token, uint256 amount, uint256 duration)
        external
        nonReentrant
        returns (uint256 lockId)
    {
        require(token != address(0), "Zero token address");
        require(amount > 0, "Must lock tokens");
        require(duration >= MIN_LOCK_DURATION, "Lock too short");
        require(duration <= MAX_LOCK_DURATION, "Lock too long");

        uint256 unlockTime = block.timestamp + duration;
        lockId = tokenLocks[msg.sender][token].length;

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        tokenLocks[msg.sender][token].push(Lock({
            amount: amount,
            unlockTime: unlockTime,
            withdrawn: false
        }));

        emit TokenLocked(msg.sender, token, lockId, amount, unlockTime);
    }

    /**
     * @notice Withdraw ERC-20 tokens from a lock once the unlock time has passed.
     */
    function withdrawToken(address token, uint256 lockId) external nonReentrant {
        Lock storage lock = _getTokenLock(msg.sender, token, lockId);
        require(block.timestamp >= lock.unlockTime, "Still locked");
        require(!lock.withdrawn, "Already withdrawn");

        lock.withdrawn = true;
        uint256 amount = lock.amount;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit TokenWithdrawn(msg.sender, token, lockId, amount);
    }

    /**
     * @notice Extend an existing token lock.
     */
    function extendTokenLock(address token, uint256 lockId, uint256 additionalDuration) external {
        require(additionalDuration > 0, "No extension");
        Lock storage lock = _getTokenLock(msg.sender, token, lockId);
        require(!lock.withdrawn, "Already withdrawn");

        uint256 newUnlockTime = lock.unlockTime + additionalDuration;
        require(newUnlockTime <= block.timestamp + MAX_LOCK_DURATION, "Exceeds max duration");
        lock.unlockTime = newUnlockTime;
    }

    /**
     * @notice Add more tokens to an existing lock.
     */
    function topUpToken(address token, uint256 lockId, uint256 amount) external nonReentrant {
        require(amount > 0, "Must add tokens");
        Lock storage lock = _getTokenLock(msg.sender, token, lockId);
        require(!lock.withdrawn, "Already withdrawn");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        lock.amount += amount;
    }

    // -------------------------------------------------------------------------
    // Views
    // -------------------------------------------------------------------------

    function getETHLockCount(address user) external view returns (uint256) {
        return ethLocks[user].length;
    }

    function getETHLock(address user, uint256 lockId) external view returns (Lock memory) {
        return _getEthLock(user, lockId);
    }

    function getTokenLockCount(address user, address token) external view returns (uint256) {
        return tokenLocks[user][token].length;
    }

    function getTokenLock(address user, address token, uint256 lockId) external view returns (Lock memory) {
        return _getTokenLock(user, token, lockId);
    }

    function getTimeRemaining(address user, uint256 lockId) external view returns (uint256) {
        Lock memory lock = _getEthLock(user, lockId);
        if (block.timestamp >= lock.unlockTime) return 0;
        return lock.unlockTime - block.timestamp;
    }

    function getTokenTimeRemaining(address user, address token, uint256 lockId) external view returns (uint256) {
        Lock memory lock = _getTokenLock(user, token, lockId);
        if (block.timestamp >= lock.unlockTime) return 0;
        return lock.unlockTime - block.timestamp;
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    function _getEthLock(address user, uint256 lockId) internal view returns (Lock storage) {
        require(lockId < ethLocks[user].length, "Invalid lock ID");
        return ethLocks[user][lockId];
    }

    function _getTokenLock(address user, address token, uint256 lockId) internal view returns (Lock storage) {
        require(lockId < tokenLocks[user][token].length, "Invalid lock ID");
        return tokenLocks[user][token][lockId];
    }
}
