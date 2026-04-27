import Link from "next/link";

export const metadata = { title: "College — MLSN" };

const SUB_SPORTS = [
  { label: "Football", href: "/sports/college/football" },
  { label: "Basketball", href: "/sports/college/basketball" },
  { label: "Volleyball", href: "/sports/college/volleyball" },
] as const;

export default function CollegeHubPage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-12 md:px-6 md:py-20 lg:px-10">
      <p className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
        MLSN · College
      </p>
      <h1 className="mt-4 font-nippo text-4xl font-bold tracking-tight text-bone-50 md:text-6xl">
        College
      </h1>
      <p className="mt-4 max-w-prose text-base text-bone-200">
        Pick a sport. Headlines and standings land here as we build each one.
      </p>

      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {SUB_SPORTS.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="block rounded-lg border border-bone-800 bg-bone-900 p-6 transition-colors hover:border-bone-700 hover:bg-bone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            >
              <h2 className="font-nippo text-2xl font-bold tracking-tight text-bone-50">
                {s.label}
              </h2>
              <p className="mt-2 font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-bone-400">
                Coming soon
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
