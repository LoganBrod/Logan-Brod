import { Skeleton } from "@/app/components/Waiting";

/** A saved clozet on its way: the code's place, and the rail's. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <header aria-hidden className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="eyebrow">Saved Clozet</p>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-9 w-32" />
      </header>
      <div aria-hidden className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full" />
        ))}
      </div>
    </main>
  );
}
