import Link from "next/link";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <ModulePlaceholder
        icon="🚪"
        title="Login"
        message="Coming in Task 03"
      />
      <Link
        href="/chat"
        className="text-sm text-river-500 underline underline-offset-4 hover:text-river-50"
      >
        Skip to Chat →
      </Link>
    </main>
  );
}
