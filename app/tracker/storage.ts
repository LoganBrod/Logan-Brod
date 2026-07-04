import { TrackerState, defaultState } from "./types";

const STORAGE_KEY = "roobet-deal-tracker-v1";

export function loadState(): TrackerState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as TrackerState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.deals) || parsed.deals.length === 0) {
      return defaultState();
    }
    if (!parsed.deals.some((d) => d.id === parsed.activeDealId)) {
      parsed.activeDealId = parsed.deals[0].id;
    }
    return parsed;
  } catch {
    return defaultState();
  }
}

export function saveState(state: TrackerState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full / private mode — nothing we can do client-side
  }
}

export function exportState(state: TrackerState): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `roobet-deal-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImportedState(json: string): TrackerState | null {
  try {
    const parsed = JSON.parse(json) as TrackerState;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.deals) || parsed.deals.length === 0) {
      return null;
    }
    if (!parsed.deals.some((d) => d.id === parsed.activeDealId)) {
      parsed.activeDealId = parsed.deals[0].id;
    }
    if (!Array.isArray(parsed.tasks)) parsed.tasks = [];
    if (!parsed.taskLog || typeof parsed.taskLog !== "object") parsed.taskLog = {};
    return parsed;
  } catch {
    return null;
  }
}
