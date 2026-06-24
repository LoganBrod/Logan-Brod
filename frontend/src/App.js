import React, { useState, useEffect } from "react";
import { useWallet } from "./useWallet";

const PRESET_DURATIONS = [
  { label: "1 hr",    seconds: 3600 },
  { label: "12 hrs",  seconds: 43200 },
  { label: "1 day",   seconds: 86400 },
  { label: "3 days",  seconds: 259200 },
  { label: "1 week",  seconds: 604800 },
  { label: "30 days", seconds: 2592000 },
  { label: "90 days", seconds: 7776000 },
  { label: "1 year",  seconds: 31536000 },
];

const VAULT_TEMPLATES = [
  { label: "Tax Vault",       note: "Do NOT touch — quarterly taxes",     duration: 7776000,  color: "orange" },
  { label: "Equipment Fund",  note: "Streaming gear upgrades",            duration: 2592000,  color: "blue" },
  { label: "Emergency Only",  note: "Last resort — hands off",            duration: 31536000, color: "red" },
  { label: "Sponsorship Hold",note: "Pending sponsor payment",            duration: 604800,   color: "purple" },
  { label: "Monthly Salary",  note: "Pay myself at end of month",         duration: 2592000,  color: "teal" },
  { label: "Stream Bankroll", note: "This week's gambling budget only",   duration: 604800,   color: "green" },
];

const VAULT_COLORS = {
  teal:   { accent: "#2dd4bf", bg: "#0d2e2b", border: "#134e4a" },
  green:  { accent: "#4ade80", bg: "#0d2b1a", border: "#14532d" },
  blue:   { accent: "#60a5fa", bg: "#0d1f3a", border: "#1e3a5f" },
  purple: { accent: "#a78bfa", bg: "#1a0d3a", border: "#3b1f6e" },
  orange: { accent: "#fb923c", bg: "#2b1500", border: "#7c2d12" },
  red:    { accent: "#f87171", bg: "#2b0d0d", border: "#7f1d1d" },
};

function formatCountdown(seconds) {
  if (seconds <= 0) return "Unlocked";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatETH(val) {
  return parseFloat(val).toFixed(4);
}

function ProgressBar({ secondsRemaining, totalDuration }) {
  if (!totalDuration) return null;
  const pct = Math.max(0, Math.min(100, ((totalDuration - secondsRemaining) / totalDuration) * 100));
  return (
    <div style={styles.progressTrack}>
      <div style={{ ...styles.progressFill, width: `${pct}%` }} />
    </div>
  );
}

function CountdownTick({ initialSeconds }) {
  const [secs, setSecs] = useState(initialSeconds);
  useEffect(() => {
    setSecs(initialSeconds);
    if (initialSeconds <= 0) return;
    const id = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [initialSeconds]);
  return <span>{formatCountdown(secs)}</span>;
}

export default function App() {
  const { connect, address, locks, lockETH, withdrawETH, extendLock, topUp, refreshLocks, status, loading } = useWallet();

  const [view, setView] = useState("vaults"); // "vaults" | "new"
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState(86400);
  const [customDays, setCustomDays] = useState("");
  const [vaultLabel, setVaultLabel] = useState("");
  const [vaultNote, setVaultNote] = useState("");
  const [vaultColor, setVaultColor] = useState("teal");
  const [expandedId, setExpandedId] = useState(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [extendDays, setExtendDays] = useState("");
  const [actionMode, setActionMode] = useState(null); // "topup" | "extend"

  const activeLocks = locks.filter((l) => !l.withdrawn);
  const pastLocks = locks.filter((l) => l.withdrawn);
  const totalLocked = activeLocks.reduce((sum, l) => sum + parseFloat(l.amount), 0);

  const applyTemplate = (t) => {
    setVaultLabel(t.label);
    setVaultNote(t.note);
    setDuration(t.duration);
    setCustomDays("");
    setVaultColor(t.color);
  };

  const handleLock = (e) => {
    e.preventDefault();
    const secs = customDays ? Math.round(parseFloat(customDays) * 86400) : duration;
    if (!amount || parseFloat(amount) <= 0) return;
    lockETH(amount, secs, vaultLabel || "My Vault", vaultNote, vaultColor);
    setView("vaults");
    setAmount("");
    setVaultLabel("");
    setVaultNote("");
  };

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>⬡</span>
          <span style={styles.logoText}>Lockbox</span>
        </div>

        <nav style={styles.nav}>
          <button
            style={{ ...styles.navItem, ...(view === "vaults" ? styles.navItemActive : {}) }}
            onClick={() => setView("vaults")}
          >
            <span style={styles.navIcon}>▦</span> My Vaults
          </button>
          <button
            style={{ ...styles.navItem, ...(view === "new" ? styles.navItemActive : {}) }}
            onClick={() => setView("new")}
          >
            <span style={styles.navIcon}>＋</span> New Vault
          </button>
        </nav>

        {address && (
          <div style={styles.sidebarFooter}>
            <div style={styles.totalCard}>
              <div style={styles.totalLabel}>Total Locked</div>
              <div style={styles.totalValue}>{totalLocked.toFixed(4)} ETH</div>
              <div style={styles.totalSub}>{activeLocks.length} active vault{activeLocks.length !== 1 ? "s" : ""}</div>
            </div>
            <div style={styles.addressChip}>
              {address.slice(0, 6)}...{address.slice(-4)}
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main style={styles.main}>
        {/* Top bar */}
        <div style={styles.topbar}>
          <div>
            <h1 style={styles.pageTitle}>
              {view === "vaults" ? "My Vaults" : "Create New Vault"}
            </h1>
            <p style={styles.pageSubtitle}>
              {view === "vaults"
                ? "Your locked funds — safe from impulse decisions"
                : "Lock your funds away for a set period"}
            </p>
          </div>
          {!address ? (
            <button style={styles.connectBtn} onClick={connect}>Connect Wallet</button>
          ) : (
            <button style={styles.refreshBtn} onClick={refreshLocks}>↻ Refresh</button>
          )}
        </div>

        {status && <div style={styles.statusBar}>{status}</div>}

        {!address && (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>⬡</div>
            <h2 style={styles.emptyTitle}>Connect your wallet to get started</h2>
            <p style={styles.emptyText}>Lock your crypto in time-sealed vaults. Funds cannot be accessed until the timer expires.</p>
            <button style={styles.connectBtn} onClick={connect}>Connect Wallet</button>
          </div>
        )}

        {/* Vaults View */}
        {address && view === "vaults" && (
          <>
            {activeLocks.length === 0 && (
              <div style={styles.emptyState}>
                <div style={styles.emptyIcon}>🔒</div>
                <h2 style={styles.emptyTitle}>No active vaults</h2>
                <p style={styles.emptyText}>Create your first vault to lock funds away from yourself.</p>
                <button style={styles.connectBtn} onClick={() => setView("new")}>Create Vault</button>
              </div>
            )}

            <div style={styles.vaultGrid}>
              {activeLocks.map((lock) => {
                const colors = VAULT_COLORS[lock.color] || VAULT_COLORS.teal;
                const isExpanded = expandedId === lock.id;
                const pct = lock.totalDuration
                  ? Math.max(0, Math.min(100, ((lock.totalDuration - lock.secondsRemaining) / lock.totalDuration) * 100))
                  : 0;

                return (
                  <div
                    key={lock.id}
                    style={{
                      ...styles.vaultCard,
                      background: colors.bg,
                      borderColor: isExpanded ? colors.accent : colors.border,
                    }}
                    onClick={() => setExpandedId(isExpanded ? null : lock.id)}
                  >
                    {/* Card header */}
                    <div style={styles.vaultCardTop}>
                      <div style={{ ...styles.vaultDot, background: colors.accent }} />
                      <div style={styles.vaultLabelRow}>
                        <span style={styles.vaultName}>{lock.label}</span>
                        <span style={{
                          ...styles.vaultBadge,
                          background: lock.secondsRemaining === 0 ? "#064e3b" : "#1c1c2e",
                          color: lock.secondsRemaining === 0 ? "#4ade80" : colors.accent,
                          border: `1px solid ${lock.secondsRemaining === 0 ? "#065f46" : colors.border}`,
                        }}>
                          {lock.secondsRemaining === 0 ? "✓ Unlocked" : "Locked"}
                        </span>
                      </div>
                    </div>

                    {lock.note && <p style={styles.vaultNote}>"{lock.note}"</p>}

                    <div style={styles.vaultAmount}>{formatETH(lock.amount)} <span style={styles.vaultAmountUnit}>ETH</span></div>

                    {/* Progress */}
                    <div style={styles.progressTrack}>
                      <div style={{ ...styles.progressFill, width: `${pct}%`, background: colors.accent }} />
                    </div>

                    <div style={styles.vaultTimerRow}>
                      <span style={styles.vaultTimerLabel}>Time remaining</span>
                      <span style={{ ...styles.vaultTimer, color: lock.secondsRemaining === 0 ? "#4ade80" : colors.accent }}>
                        <CountdownTick initialSeconds={lock.secondsRemaining} />
                      </span>
                    </div>

                    <p style={styles.vaultUnlockDate}>Unlocks {lock.unlockTime.toLocaleString()}</p>

                    {/* Expanded actions */}
                    {isExpanded && (
                      <div style={styles.vaultActions} onClick={(e) => e.stopPropagation()}>
                        <div style={styles.vaultActionsRow}>
                          {lock.secondsRemaining === 0 ? (
                            <button
                              style={{ ...styles.actionBtn, background: "#065f46", color: "#4ade80", border: "1px solid #059669" }}
                              onClick={() => withdrawETH(lock.id)}
                              disabled={loading}
                            >
                              Withdraw Funds
                            </button>
                          ) : (
                            <>
                              <button
                                style={{ ...styles.actionBtn, ...(actionMode === "topup" && expandedId === lock.id ? styles.actionBtnActive(colors.accent) : {}) }}
                                onClick={() => setActionMode(actionMode === "topup" ? null : "topup")}
                              >
                                + Add Funds
                              </button>
                              <button
                                style={{ ...styles.actionBtn, ...(actionMode === "extend" && expandedId === lock.id ? styles.actionBtnActive(colors.accent) : {}) }}
                                onClick={() => setActionMode(actionMode === "extend" ? null : "extend")}
                              >
                                ⏱ Extend
                              </button>
                            </>
                          )}
                        </div>

                        {actionMode === "topup" && expandedId === lock.id && (
                          <div style={styles.inlineForm}>
                            <input
                              style={styles.inlineInput}
                              placeholder="Amount in ETH"
                              type="number"
                              step="0.001"
                              value={topUpAmount}
                              onChange={(e) => setTopUpAmount(e.target.value)}
                            />
                            <button
                              style={{ ...styles.actionBtn, background: colors.bg, borderColor: colors.accent, color: colors.accent }}
                              onClick={() => { topUp(lock.id, topUpAmount); setTopUpAmount(""); setActionMode(null); }}
                              disabled={loading || !topUpAmount}
                            >
                              Confirm
                            </button>
                          </div>
                        )}

                        {actionMode === "extend" && expandedId === lock.id && (
                          <div style={styles.inlineForm}>
                            <input
                              style={styles.inlineInput}
                              placeholder="Extra days"
                              type="number"
                              step="1"
                              value={extendDays}
                              onChange={(e) => setExtendDays(e.target.value)}
                            />
                            <button
                              style={{ ...styles.actionBtn, background: colors.bg, borderColor: colors.accent, color: colors.accent }}
                              onClick={() => { extendLock(lock.id, Math.round(parseFloat(extendDays) * 86400)); setExtendDays(""); setActionMode(null); }}
                              disabled={loading || !extendDays}
                            >
                              Confirm
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Past vaults */}
            {pastLocks.length > 0 && (
              <>
                <h2 style={{ ...styles.pageTitle, fontSize: "1rem", marginTop: "40px", marginBottom: "12px", color: "#4b5563" }}>
                  Withdrawn Vaults
                </h2>
                <div style={styles.vaultGrid}>
                  {pastLocks.map((lock) => (
                    <div key={lock.id} style={{ ...styles.vaultCard, opacity: 0.4, background: "#111" }}>
                      <div style={styles.vaultName}>{lock.label}</div>
                      <div style={styles.vaultAmount}>{formatETH(lock.amount)} <span style={styles.vaultAmountUnit}>ETH</span></div>
                      <p style={{ ...styles.vaultUnlockDate, marginTop: "8px" }}>Withdrawn • locked until {lock.unlockTime.toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* New Vault View */}
        {address && view === "new" && (
          <div style={styles.newVaultLayout}>
            {/* Templates */}
            <div style={styles.templatesSection}>
              <h3 style={styles.sectionTitle}>Quick Templates</h3>
              <div style={styles.templateGrid}>
                {VAULT_TEMPLATES.map((t) => {
                  const colors = VAULT_COLORS[t.color] || VAULT_COLORS.teal;
                  return (
                    <button
                      key={t.label}
                      style={{ ...styles.templateCard, borderColor: colors.border, background: colors.bg }}
                      onClick={() => applyTemplate(t)}
                    >
                      <div style={{ ...styles.templateDot, background: colors.accent }} />
                      <div style={styles.templateLabel}>{t.label}</div>
                      <div style={styles.templateNote}>{t.note}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Form */}
            <form style={styles.formCard} onSubmit={handleLock}>
              <h3 style={styles.sectionTitle}>Vault Details</h3>

              <div style={styles.warningBox}>
                ⚠️ Once locked, funds <strong>cannot</strong> be withdrawn until the timer expires. No exceptions.
              </div>

              <label style={styles.label}>Vault Name</label>
              <input
                style={styles.input}
                placeholder="e.g. Tax Vault, Equipment Fund..."
                value={vaultLabel}
                onChange={(e) => setVaultLabel(e.target.value)}
              />

              <label style={styles.label}>Note to yourself (optional)</label>
              <input
                style={styles.input}
                placeholder="Why are you locking this? e.g. DO NOT TOUCH - rent"
                value={vaultNote}
                onChange={(e) => setVaultNote(e.target.value)}
              />

              <label style={styles.label}>Amount (ETH)</label>
              <input
                style={styles.input}
                type="number"
                step="0.001"
                min="0"
                placeholder="0.1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />

              <label style={styles.label}>Lock Duration</label>
              <div style={styles.presetGrid}>
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

              <label style={styles.label}>Or custom duration (days)</label>
              <input
                style={styles.input}
                type="number"
                min="0.042"
                step="1"
                placeholder="e.g. 14"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
              />

              <label style={styles.label}>Vault Color</label>
              <div style={styles.colorRow}>
                {Object.entries(VAULT_COLORS).map(([name, c]) => (
                  <button
                    key={name}
                    type="button"
                    style={{
                      ...styles.colorDot,
                      background: c.accent,
                      boxShadow: vaultColor === name ? `0 0 0 3px #0f1117, 0 0 0 5px ${c.accent}` : "none",
                    }}
                    onClick={() => setVaultColor(name)}
                  />
                ))}
              </div>

              <button style={styles.lockBtn} type="submit" disabled={loading}>
                {loading ? "Creating vault..." : "🔒 Lock Funds"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

const styles = {
  root: {
    display: "flex",
    minHeight: "100vh",
    background: "#0f1117",
    color: "#e2e8f0",
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
  sidebar: {
    width: "220px",
    minHeight: "100vh",
    background: "#13151f",
    borderRight: "1px solid #1e2133",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px",
    flexShrink: 0,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "36px",
    padding: "0 8px",
  },
  logoIcon: { fontSize: "1.6rem", color: "#2dd4bf" },
  logoText: { fontSize: "1.2rem", fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.02em" },
  nav: { display: "flex", flexDirection: "column", gap: "4px" },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    background: "transparent",
    border: "none",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 500,
    textAlign: "left",
    transition: "all 0.15s",
  },
  navItemActive: {
    background: "#0d2e2b",
    color: "#2dd4bf",
  },
  navIcon: { fontSize: "1rem", width: "20px" },
  sidebarFooter: { marginTop: "auto", display: "flex", flexDirection: "column", gap: "12px" },
  totalCard: {
    background: "#0d2e2b",
    border: "1px solid #134e4a",
    borderRadius: "12px",
    padding: "14px",
  },
  totalLabel: { fontSize: "0.72rem", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "4px" },
  totalValue: { fontSize: "1.3rem", fontWeight: 700, color: "#2dd4bf" },
  totalSub: { fontSize: "0.75rem", color: "#4b5563", marginTop: "2px" },
  addressChip: {
    background: "#1a1d2e",
    border: "1px solid #1e2133",
    borderRadius: "8px",
    padding: "8px 12px",
    fontSize: "0.78rem",
    color: "#6b7280",
    textAlign: "center",
  },
  main: { flex: 1, padding: "32px 36px", overflowY: "auto" },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "28px",
  },
  pageTitle: { fontSize: "1.5rem", fontWeight: 700, color: "#f1f5f9", marginBottom: "4px" },
  pageSubtitle: { fontSize: "0.85rem", color: "#4b5563" },
  connectBtn: {
    background: "linear-gradient(135deg, #0d9488, #0f766e)",
    border: "none",
    borderRadius: "10px",
    padding: "10px 22px",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  refreshBtn: {
    background: "transparent",
    border: "1px solid #1e2133",
    borderRadius: "8px",
    padding: "8px 16px",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  statusBar: {
    background: "#0d2e2b",
    border: "1px solid #134e4a",
    borderRadius: "8px",
    padding: "10px 16px",
    fontSize: "0.85rem",
    color: "#2dd4bf",
    marginBottom: "20px",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 20px",
    textAlign: "center",
  },
  emptyIcon: { fontSize: "3rem", marginBottom: "16px" },
  emptyTitle: { fontSize: "1.2rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "8px" },
  emptyText: { fontSize: "0.85rem", color: "#4b5563", maxWidth: "360px", marginBottom: "24px", lineHeight: 1.6 },
  vaultGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  vaultCard: {
    borderRadius: "16px",
    border: "1px solid",
    padding: "20px",
    cursor: "pointer",
    transition: "border-color 0.2s",
  },
  vaultCardTop: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" },
  vaultDot: { width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0 },
  vaultLabelRow: { display: "flex", alignItems: "center", justifyContent: "space-between", flex: 1, gap: "8px" },
  vaultName: { fontSize: "0.95rem", fontWeight: 600, color: "#e2e8f0" },
  vaultBadge: {
    fontSize: "0.7rem",
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: "20px",
    whiteSpace: "nowrap",
  },
  vaultNote: { fontSize: "0.78rem", color: "#4b5563", fontStyle: "italic", marginBottom: "12px" },
  vaultAmount: { fontSize: "1.8rem", fontWeight: 700, color: "#f1f5f9", marginBottom: "14px" },
  vaultAmountUnit: { fontSize: "1rem", color: "#6b7280", fontWeight: 400 },
  progressTrack: {
    height: "4px",
    background: "#1e2133",
    borderRadius: "99px",
    overflow: "hidden",
    marginBottom: "10px",
  },
  progressFill: {
    height: "100%",
    borderRadius: "99px",
    background: "#2dd4bf",
    transition: "width 0.3s ease",
  },
  vaultTimerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" },
  vaultTimerLabel: { fontSize: "0.75rem", color: "#4b5563" },
  vaultTimer: { fontSize: "0.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
  vaultUnlockDate: { fontSize: "0.72rem", color: "#374151", marginBottom: "0" },
  vaultActions: { marginTop: "16px", borderTop: "1px solid #1e2133", paddingTop: "14px" },
  vaultActionsRow: { display: "flex", gap: "8px", flexWrap: "wrap" },
  actionBtn: {
    background: "#1a1d2e",
    border: "1px solid #1e2133",
    borderRadius: "8px",
    padding: "7px 14px",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "0.82rem",
    fontWeight: 500,
  },
  actionBtnActive: (accent) => ({
    borderColor: accent,
    color: accent,
    background: "#0f1117",
  }),
  inlineForm: { display: "flex", gap: "8px", marginTop: "10px", alignItems: "center" },
  inlineInput: {
    background: "#0f1117",
    border: "1px solid #1e2133",
    borderRadius: "8px",
    padding: "7px 12px",
    color: "#e2e8f0",
    fontSize: "0.85rem",
    width: "140px",
    outline: "none",
  },
  newVaultLayout: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px", alignItems: "start" },
  templatesSection: {},
  sectionTitle: { fontSize: "0.85rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" },
  templateGrid: { display: "flex", flexDirection: "column", gap: "8px" },
  templateCard: {
    background: "#13151f",
    border: "1px solid",
    borderRadius: "10px",
    padding: "12px 14px",
    cursor: "pointer",
    textAlign: "left",
    display: "flex",
    alignItems: "flex-start",
    gap: "10px",
  },
  templateDot: { width: "8px", height: "8px", borderRadius: "50%", marginTop: "5px", flexShrink: 0 },
  templateLabel: { fontSize: "0.88rem", fontWeight: 600, color: "#e2e8f0", marginBottom: "2px" },
  templateNote: { fontSize: "0.75rem", color: "#4b5563" },
  formCard: {
    background: "#13151f",
    border: "1px solid #1e2133",
    borderRadius: "16px",
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  warningBox: {
    background: "#2b1500",
    border: "1px solid #7c2d12",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "0.82rem",
    color: "#fb923c",
    lineHeight: 1.5,
  },
  label: { fontSize: "0.78rem", color: "#6b7280", fontWeight: 500, marginBottom: "-6px" },
  input: {
    background: "#0f1117",
    border: "1px solid #1e2133",
    borderRadius: "8px",
    padding: "10px 14px",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    outline: "none",
    width: "100%",
  },
  presetGrid: { display: "flex", flexWrap: "wrap", gap: "6px" },
  presetBtn: {
    background: "#0f1117",
    border: "1px solid #1e2133",
    borderRadius: "6px",
    padding: "6px 12px",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 500,
  },
  presetBtnActive: {
    background: "#0d2e2b",
    border: "1px solid #2dd4bf",
    color: "#2dd4bf",
  },
  colorRow: { display: "flex", gap: "10px", alignItems: "center" },
  colorDot: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    transition: "box-shadow 0.15s",
  },
  lockBtn: {
    background: "linear-gradient(135deg, #0d9488, #0f766e)",
    border: "none",
    borderRadius: "10px",
    padding: "13px",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.95rem",
    marginTop: "6px",
  },
};
