"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface ToastItem {
  id: number;
  text: string;
  kind: "success" | "error";
}

interface ToastCtx {
  push: (text: string, kind?: "success" | "error") => void;
}

const Ctx = createContext<ToastCtx>({ push: () => {} });

export function useToast() {
  return useContext(Ctx);
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((text: string, kind: "success" | "error" = "success") => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }, []);

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 30, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className={
                "pointer-events-auto rounded-xl border px-4 py-2.5 text-sm font-semibold shadow-card backdrop-blur " +
                (t.kind === "success"
                  ? "border-brand/30 bg-ink-card/95 text-brand"
                  : "border-red-500/30 bg-ink-card/95 text-red-400")
              }
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
