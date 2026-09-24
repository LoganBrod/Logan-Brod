"use client";
// The Desk: a panel of tabs the assistant fills. "Show me my slope notes" puts the note here,
// beside whatever page is open, and it stays until closed. Notes and Google Docs render as
// markdown, flashcard files as a flippable deck, and the assistant can write its own tabs.
import { useEffect, useState } from "react";
import { X, ArrowSquareOut, Stack, FileText, Cards, GoogleLogo, PencilSimple } from "@phosphor-icons/react";
import { Markdown } from "@/components/Markdown";
import { Flashcards } from "@/components/Flashcards";
import { parseDeck } from "@/lib/deck";
import type { DeskItem } from "@/lib/client";

const KEY = "sos-desk";
const MAX_TABS = 8;
const ICONS = { note: FileText, doc: GoogleLogo, deck: Cards, text: PencilSimple } as const;

export function Desk() {
  const [tabs, setTabs] = useState<DeskItem[]>([]);
  const [active, setActive] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { tabs: DeskItem[]; active: string } | null;
      if (saved?.tabs?.length) { setTabs(saved.tabs); setActive(saved.active); }
    } catch {}
    const onShow = (e: Event) => {
      const items = (e as CustomEvent<DeskItem[]>).detail ?? [];
      if (!items.length) return;
      setTabs((prev) => {
        let next = prev.filter((t) => !items.some((i) => i.id === t.id));
        next = [...next, ...items].slice(-MAX_TABS);
        return next;
      });
      setActive(items[items.length - 1].id);
      setLive(false);
      setOpen(true);
    };
    window.addEventListener("desk:show", onShow);
    return () => window.removeEventListener("desk:show", onShow);
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify({ tabs, active })); } catch {} }, [tabs, active]);

  const tab = tabs.find((t) => t.id === active) ?? tabs[tabs.length - 1];
  function close(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (id === active) setActive(next[next.length - 1]?.id ?? "");
      if (!next.length) setOpen(false);
      return next;
    });
  }

  if (!tabs.length) return null;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} aria-label="Open the desk"
        className="pressable fixed z-30 bottom-20 right-4 md:bottom-6 md:right-6 rounded-full px-4 py-2.5 flex items-center gap-2 text-sm"
        style={{ background: "rgb(18 18 20 / 0.94)", border: "1px solid var(--line-strong)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", color: "var(--text)" }}>
        <Stack size={18} weight="light" /> Desk <span className="mono text-[11px]" style={{ color: "var(--faint)" }}>{tabs.length}</span>
      </button>
    );
  }
  const docId = tab?.kind === "doc" ? tab.id.slice(4) : "";

  return (
    <aside className="fixed z-30 inset-x-0 bottom-0 top-0 pb-16 md:pb-0 md:inset-auto md:top-4 md:right-4 md:bottom-4 md:w-[min(600px,46vw)] flex flex-col rise"
      style={{ background: "rgb(12 12 14 / 0.96)", border: "1px solid var(--line-strong)", backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)", borderRadius: "var(--radius)" }}
      aria-label="Desk">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 overflow-x-auto" style={{ borderBottom: "1px solid var(--line)" }}>
        <span className="mono text-[11px] uppercase tracking-[0.18em] pr-2 shrink-0" style={{ color: "var(--faint)" }}>Desk</span>
        {tabs.map((t) => {
          const Icon = ICONS[t.kind];
          const on = t.id === tab?.id;
          return (
            <span key={t.id} className="shrink-0 flex items-center rounded-full text-xs" style={{ background: on ? "var(--glass-2)" : "transparent", border: `1px solid ${on ? "var(--line-strong)" : "transparent"}` }}>
              <button onClick={() => { setActive(t.id); setLive(false); }} className="pressable pl-3 pr-1.5 py-1.5 flex items-center gap-1.5 max-w-44" style={{ color: on ? "var(--text)" : "var(--muted)" }}>
                <Icon size={13} weight="light" /><span className="truncate">{t.title}</span>
              </button>
              <button onClick={() => close(t.id)} aria-label={`Close ${t.title}`} className="pressable pr-2 pl-0.5 py-1.5" style={{ color: "var(--faint)" }}><X size={12} /></button>
            </span>
          );
        })}
        <span className="grow" />
        {tab?.url && (
          <a href={tab.url} target="_blank" rel="noreferrer" className="pressable shrink-0 p-2 rounded-full" style={{ color: "var(--muted)" }} aria-label="Open in Google Docs"><ArrowSquareOut size={16} /></a>
        )}
        <button onClick={() => setOpen(false)} className="pressable shrink-0 p-2 rounded-full" style={{ color: "var(--muted)" }} aria-label="Hide the desk"><X size={16} /></button>
      </div>

      {tab && (
        <div className="grow overflow-y-auto px-5 py-5 md:px-6">
          <div className="mb-4">
            <h2 className="text-xl leading-tight">{tab.title}</h2>
            <div className="mono text-[11px] mt-1 flex items-center gap-3" style={{ color: "var(--faint)" }}>
              {tab.subtitle ?? (tab.kind === "text" ? "Written by the assistant" : tab.kind)}
              {tab.kind === "doc" && (
                <button onClick={() => setLive(!live)} className="pressable underline underline-offset-4" style={{ color: "var(--muted)" }}>{live ? "Text view" : "Live view"}</button>
              )}
            </div>
          </div>
          {tab.kind === "doc" && live ? (
            <iframe title={tab.title} src={`https://docs.google.com/document/d/${docId}/preview`} className="w-full rounded-xl" style={{ height: "calc(100dvh - 220px)", background: "white", border: "1px solid var(--line)" }} />
          ) : tab.kind === "deck" ? (
            <Flashcards cards={parseDeck(tab.body)} />
          ) : (
            <div className="prose-note text-[15px]"><Markdown body={tab.body} /></div>
          )}
        </div>
      )}
    </aside>
  );
}
