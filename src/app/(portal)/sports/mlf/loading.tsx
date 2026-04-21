export default function FantasyLoading() {
  return (
    <div className="flex flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-6 w-40 animate-pulse rounded-md bg-bone-800" />
          <div className="mt-2 h-4 w-24 animate-pulse rounded-md bg-bone-800/70" />
        </div>
        <div className="h-9 w-28 animate-pulse rounded-md bg-bone-800/70" />
      </div>
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-8 w-24 animate-pulse rounded-full bg-bone-800/70"
          />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-12 w-full animate-pulse rounded-md bg-bone-900/60"
          />
        ))}
      </div>
    </div>
  );
}
