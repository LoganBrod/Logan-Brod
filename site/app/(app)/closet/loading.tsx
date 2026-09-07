import { Skeleton, SkeletonHeader } from "@/app/components/Waiting";

/** The three closet tabs, before whichever one is coming has arrived. */
export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 pb-14 pt-6">
      <SkeletonHeader tabs />
      <div aria-hidden className="panel space-y-4 px-6 py-6">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
    </main>
  );
}
