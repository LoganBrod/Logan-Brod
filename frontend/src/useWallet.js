import { useState, useCallback } from "react";
import { BrowserProvider, Contract, parseEther, formatEther } from "ethers";
import { LOCKBOX_ABI } from "./abi";
import contractAddressJson from "./contractAddress.json";

const CONTRACT_ADDRESS = contractAddressJson.contractAddress;

export function useWallet() {
  const [provider, setProvider] = useState(null);
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

      setProvider(_provider);
      setSigner(_signer);
      setAddress(_address);
      setContract(_contract);
      setStatus("Wallet connected.");
      await _fetchLocks(_contract, _address);
    } catch (e) {
      setStatus("Connection failed: " + (e.reason || e.message));
    }
  }, []);

  const _fetchLocks = async (_contract, _address) => {
    try {
      const count = await _contract.getETHLockCount(_address);
      const items = [];
      for (let i = 0; i < Number(count); i++) {
        const lock = await _contract.getETHLock(_address, i);
        const remaining = await _contract.getTimeRemaining(_address, i);
        items.push({
          id: i,
          amount: formatEther(lock.amount),
          unlockTime: new Date(Number(lock.unlockTime) * 1000),
          withdrawn: lock.withdrawn,
          secondsRemaining: Number(remaining),
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

  const lockETH = useCallback(async (amountEth, durationSeconds) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.lockETH(durationSeconds, {
        value: parseEther(amountEth),
      });
      setStatus("Locking... tx: " + tx.hash);
      await tx.wait();
      setStatus("ETH locked successfully!");
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
      setStatus("Withdrawing... tx: " + tx.hash);
      await tx.wait();
      setStatus("ETH withdrawn successfully!");
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
      setStatus("Extending lock... tx: " + tx.hash);
      await tx.wait();
      setStatus("Lock extended!");
      await _fetchLocks(contract, address);
    } catch (e) {
      setStatus("Error: " + (e.reason || e.message));
    } finally {
      setLoading(false);
    }
  }, [contract, address]);

  return { connect, address, locks, lockETH, withdrawETH, extendLock, refreshLocks, status, loading };
}
