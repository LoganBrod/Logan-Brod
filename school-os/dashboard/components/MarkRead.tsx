"use client";
import { useRouter } from "next/navigation";
export function MarkRead({ ids }: { ids: string[] }) {
  const router = useRouter();
  if (!ids.length) return null;
  return (
    <button onClick={async () => { await fetch("/api/read", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) }); router.refresh(); }} className="pressable card-2 px-3 py-1.5 text-xs">
      Mark all read
    </button>
  );
}
