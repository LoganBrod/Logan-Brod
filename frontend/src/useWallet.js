import { useState, useCallback } from "react";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import { LOCKBOX_ABI } from "./abi";
import contractAddressJson from "./contractAddress.json";

const CONTRACT_ADDRESS = contractAddressJson.contractAddress;

// Store vault metadata in localStorage since the contract only stores amounts/times
const STORAGE_KEY = "lockbox_vault_meta";

function loadMeta() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveMeta(meta) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
}

export function useWallet() {
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [address, setAddress] = useState(null);
  const [locks, setLocks] = useState([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setStatus("MetaMask not found. Please install it.");
      return;
    }
    try {
      const _provider = new BrowserProvider(window.ethereum);
      await _provider.send("eth_requestAccounts", []);
      const _signer = await _provider.getSigner();
      const _address = await _signer.getAddress();
      const _contract = new Contract(CONTRACT_ADDRESS, LOCKBOX_ABI, _signer);
      setSigner(_signer);
      setAddress(_address);
      setContract(_contract);
      setStatus("");
      await _fetchLocks(_contract, _address);
    } catch (e) {
      setStatus("Connection failed: " + (e.reason || e.message));
    }
  }, []);

  const _fetchLocks = async (_contract, _address) => {
    try {
      const count = await _contract.getETHLockCount(_address);
      const meta = loadMeta();
      const items = [];
      for (let i = 0; i < Number(count); i++) {
        const lock = await _contract.getETHLock(_address, i);
        const remaining = await _contract.getTimeRemaining(_address, i);
        const key = `${_address}_${i}`;
        items.push({
          id: i,
          amount: formatEther(lock.amount),
          unlockTime: new Date(Number(lock.unlockTime) * 1000),
          withdrawn: lock.withdrawn,
          secondsRemaining: Number(remaining),
          label: meta[key]?.label || `Vault #${i + 1}`,
          note: meta[key]?.note || "",
          color: meta[key]?.color || "teal",
          totalDuration: meta[key]?.totalDuration || 0,
        });
      }
      setLocks(items);
    } catch (e) {
      console.error("Failed to fetch locks:", e);
    }
  };

  const refreshLocks = useCallback(() => {
    if (contract && address) _fetchLocks(contract, address);
  }, [contract, address]);

  const lockETH = useCallback(async (amountEth, durationSeconds, label, note, color) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.lockETH(durationSeconds, { value: parseEther(amountEth), gasLimit: 200000 });
      setStatus("Locking funds...");
      const receipt = await tx.wait();

      // Save metadata
      const meta = loadMeta();
      const lockId = Number(await contract.getETHLockCount(address)) - 1;
      const key = `${address}_${lockId}`;
      meta[key] = { label, note, color, totalDuration: durationSeconds };
      saveMeta(meta);

      setStatus("Vault created successfully!");
      await _fetchLocks(contract, address);
    } catch (e) {
      setStatus("Error: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }, [contract, address]);

  const withdrawETH = useCallback(async (lockId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.withdrawETH(lockId);
      setStatus("Withdrawing...");
      await tx.wait();
      setStatus("Funds withdrawn to your wallet!");
      await _fetchLocks(contract, address);
    } catch (e) {
      setStatus("Error: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }, [contract, address]);

  const extendLock = useCallback(async (lockId, additionalSeconds) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.extendETHLock(lockId, additionalSeconds);
      setStatus("Extending vault lock...");
      await tx.wait();
      setStatus("Lock extended!");
      await _fetchLocks(contract, address);
    } catch (e) {
      setStatus("Error: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }, [contract, address]);

  const topUp = useCallback(async (lockId, amountEth) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.topUpETH(lockId, { value: parseEther(amountEth) });
      setStatus("Adding funds to vault...");
      await tx.wait();
      setStatus("Vault topped up!");
      await _fetchLocks(contract, address);
    } catch (e) {
      setStatus("Error: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }, [contract, address]);

  return { connect, address, locks, lockETH, withdrawETH, extendLock, topUp, refreshLocks, status, loading };
}
