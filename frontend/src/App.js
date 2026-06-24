import React, { useState } from "react";
import { useWallet } from "./useWallet";

const PRESET_DURATIONS = [
  { label: "1 hour",   seconds: 3600 },
  { label: "3 hours",  seconds: 10800 },
  { label: "12 hours", seconds: 43200 },
  { label: "1 day",    seconds: 86400 },
  { label: "3 days",   seconds: 259200 },
  { label: "1 week",   seconds: 604800 },
  { label: "30 days",  seconds: 2592000 },
];

function formatCountdown(seconds) {
  if (seconds <= 0) return "Unlocked";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(" ");
}

export default function App() {
  const { connect, address, locks, lockETH, withdrawETH, extendLock, refreshLocks, status, loading } = useWallet();

  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(3600);
  const [customDays, setCustomDays] = useState("");
  const [extendId, setExtendId] = useState(null);
  const [extendDays, setExtendDays] = useState("");

  const handleLock = (e) => {
    e.preventDefault();
    const secs = customDays ? Math.round(parseFloat(customDays) * 86400) : duration;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) return;
    lockETH(amount, secs);
  };

  const activeLocks = locks.filter((l) => !l.withdrawn);
  const pastLocks = locks.filter((l) => l.withdrawn);

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={styles.logo}>🔒 Lockbox Wallet</div>
        <p style={styles.tagline}>Lock your crypto away. Stay out of your own funds.</p>
        {address ? (
          <div style={styles.addressBadge}>
            {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        ) : (
          <button style={styles.btn} onClick={connect}>Connect Wallet</button>
        )}
      </header>

      {status && (
        <div style={styles.statusBar}>
          {status}
        </div>
      )}

      {address && (
        <main style={styles.main}>
          {/* Lock Form */}
          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Lock ETH</h2>
            <p style={styles.warning}>
              ⚠️ Once locked, funds CANNOT be accessed until the timer expires — not even by you.
            </p>
            <form onSubmit={handleLock} style={styles.form}>
              <label style={styles.label}>Amount (ETH)</label>
              <input
                style={styles.input}
                type="number"
                step="0.001"
                min="0"
                placeholder="0.1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />

              <label style={styles.label}>Lock Duration</label>
              <div style={styles.presets}>
                {PRESET_DURATIONS.map((p) => (
                  <button
                    key={p.seconds}
                    type="button"
                    style={{
                      ...styles.presetBtn,
                      ...(duration === p.seconds && !customDays ? styles.presetBtnActive : {}),
                    }}
                    onClick={() => { setDuration(p.seconds); setCustomDays(""); }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <label style={styles.label}>Or custom (days)</label>
              <input
                style={styles.input}
                type="number"
                min="0.042"
                step="0.5"
                placeholder="e.g. 14"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
              />

              <button style={{ ...styles.btn, ...styles.lockBtn }} type="submit" disabled={loading}>
                {loading ? "Processing..." : "🔒 Lock ETH"}
              </button>
            </form>
          </section>

          {/* Active Locks */}
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Active Locks ({activeLocks.length})</h2>
              <button style={styles.refreshBtn} onClick={refreshLocks}>↻ Refresh</button>
            </div>
            {activeLocks.length === 0 ? (
              <p style={styles.empty}>No active locks. Lock some ETH to get started.</p>
            ) : (
              activeLocks.map((lock) => (
                <div key={lock.id} style={styles.lockCard}>
                  <div style={styles.lockRow}>
                    <span style={styles.lockAmount}>{parseFloat(lock.amount).toFixed(4)} ETH</span>
                    <span style={{
                      ...styles.lockStatus,
                      color: lock.secondsRemaining === 0 ? "#4ade80" : "#facc15",
                    }}>
                      {lock.secondsRemaining === 0 ? "✅ Ready" : `⏳ ${formatCountdown(lock.secondsRemaining)}`}
                    </span>
                  </div>
                  <p style={styles.lockDate}>Unlocks: {lock.unlockTime.toLocaleString()}</p>

                  {lock.secondsRemaining === 0 ? (
                    <button
                      style={{ ...styles.btn, ...styles.withdrawBtn }}
                      onClick={() => withdrawETH(lock.id)}
                      disabled={loading}
                    >
                      Withdraw
                    </button>
                  ) : (
                    <div style={styles.extendRow}>
                      {extendId === lock.id ? (
                        <>
                          <input
                            style={{ ...styles.input, width: "120px", marginBottom: 0 }}
                            type="number"
                            min="0.042"
                            step="0.5"
                            placeholder="Days"
                            value={extendDays}
                            onChange={(e) => setExtendDays(e.target.value)}
                          />
                          <button
                            style={styles.btn}
                            onClick={() => {
                              extendLock(lock.id, Math.round(parseFloat(extendDays) * 86400));
                              setExtendId(null);
                              setExtendDays("");
                            }}
                            disabled={loading || !extendDays}
                          >
                            Confirm
                          </button>
                          <button style={styles.cancelBtn} onClick={() => setExtendId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button style={styles.extendBtn} onClick={() => setExtendId(lock.id)}>
                          + Extend Lock
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          {/* Past Locks */}
          {pastLocks.length > 0 && (
            <section style={styles.card}>
              <h2 style={styles.cardTitle}>Withdrawn Locks</h2>
              {pastLocks.map((lock) => (
                <div key={lock.id} style={{ ...styles.lockCard, opacity: 0.5 }}>
                  <div style={styles.lockRow}>
                    <span style={styles.lockAmount}>{parseFloat(lock.amount).toFixed(4)} ETH</span>
                    <span style={{ color: "#9ca3af" }}>Withdrawn</span>
                  </div>
                  <p style={styles.lockDate}>Was locked until: {lock.unlockTime.toLocaleString()}</p>
                </div>
              ))}
            </section>
          )}
        </main>
      )}
    </div>
  );
}

const styles = {
  app: { minHeight: "100vh", background: "#0a0a0f", color: "#e0e0e0" },
  header: {
    background: "linear-gradient(135deg, #1a0533 0%, #0d1a3a 100%)",
    padding: "32px 24px",
    textAlign: "center",
    borderBottom: "1px solid #2d2d4e",
  },
  logo: { fontSize: "2rem", fontWeight: 700, color: "#a78bfa", marginBottom: "8px" },
  tagline: { color: "#9ca3af", marginBottom: "20px" },
  addressBadge: {
    display: "inline-block",
    background: "#1e1b4b",
    border: "1px solid #4f46e5",
    borderRadius: "20px",
    padding: "6px 16px",
    fontSize: "0.85rem",
    color: "#a5b4fc",
  },
  statusBar: {
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    padding: "10px 24px",
    fontSize: "0.85rem",
    color: "#94a3b8",
    textAlign: "center",
  },
  main: { maxWidth: "640px", margin: "32px auto", padding: "0 16px", display: "flex", flexDirection: "column", gap: "24px" },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "16px",
    padding: "24px",
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" },
  cardTitle: { fontSize: "1.1rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "16px" },
  warning: {
    background: "#2d1a00",
    border: "1px solid #92400e",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "0.85rem",
    color: "#fbbf24",
    marginBottom: "20px",
  },
  form: { display: "flex", flexDirection: "column", gap: "12px" },
  label: { fontSize: "0.85rem", color: "#9ca3af", marginBottom: "4px" },
  input: {
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#e2e8f0",
    fontSize: "1rem",
    width: "100%",
    outline: "none",
  },
  presets: { display: "flex", flexWrap: "wrap", gap: "8px" },
  presetBtn: {
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "6px",
    padding: "6px 12px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "0.82rem",
  },
  presetBtnActive: {
    background: "#4f46e5",
    border: "1px solid #6366f1",
    color: "#fff",
  },
  btn: {
    background: "#4f46e5",
    border: "none",
    borderRadius: "8px",
    padding: "10px 20px",
    color: "#fff",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
  },
  lockBtn: { marginTop: "8px", padding: "14px", fontSize: "1rem" },
  withdrawBtn: { background: "#16a34a", marginTop: "10px", padding: "8px 18px" },
  extendBtn: {
    background: "transparent",
    border: "1px solid #4f46e5",
    borderRadius: "6px",
    padding: "6px 14px",
    color: "#a5b4fc",
    cursor: "pointer",
    fontSize: "0.85rem",
    marginTop: "10px",
  },
  cancelBtn: {
    background: "transparent",
    border: "1px solid #374151",
    borderRadius: "6px",
    padding: "6px 12px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  refreshBtn: {
    background: "transparent",
    border: "1px solid #374151",
    borderRadius: "6px",
    padding: "4px 12px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  empty: { color: "#6b7280", textAlign: "center", padding: "24px 0" },
  lockCard: {
    background: "#1f2937",
    border: "1px solid #374151",
    borderRadius: "10px",
    padding: "16px",
    marginBottom: "12px",
  },
  lockRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" },
  lockAmount: { fontSize: "1.1rem", fontWeight: 600, color: "#e2e8f0" },
  lockStatus: { fontSize: "0.9rem", fontWeight: 500 },
  lockDate: { fontSize: "0.8rem", color: "#6b7280", marginBottom: "4px" },
  extendRow: { display: "flex", gap: "8px", alignItems: "center", marginTop: "10px", flexWrap: "wrap" },
};
