export default function PlayerProfileLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 pt-20 md:pt-8">
      <div className="mb-4 h-4 w-16 animate-pulse rounded bg-bone-800/60" />
      <div className="space-y-3">
        <div className="h-9 w-64 animate-pulse rounded bg-bone-800" />
        <div className="h-4 w-40 animate-pulse rounded bg-bone-800/70" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-bone-900/60" />
        ))}
      </div>
      <div className="mt-6 h-32 animate-pulse rounded-lg bg-bone-900/60" />
    </div>
  );
}
