"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Invalid credentials");
        setSubmitting(false);
        return;
      }

      const data = (await res.json()) as { redirect?: string };
      router.push(data.redirect ?? "/chat");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bone-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-bone-700 bg-bone-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-bone-50">
            The Lazy River Co.
          </h1>
          <p className="mt-2 text-sm italic text-bone-300">
            Float in, MLF.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="username"
              className="mb-1.5 block text-xs font-medium text-bone-200"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-bone-50 placeholder-bone-400 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-medium text-bone-200"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-bone-50 placeholder-bone-400 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500"
            />
          </div>

          <div aria-live="polite" className="min-h-[1.25rem]">
            {error ? (
              <p className="text-sm text-red-400">{error}</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-claude-500 px-4 py-2 text-sm font-medium text-bone-50 transition-colors hover:bg-claude-600 focus:outline-none focus:ring-2 focus:ring-claude-500 focus:ring-offset-2 focus:ring-offset-bone-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Floating in…" : "Float In"}
          </button>
        </form>
      </div>
    </main>
  );
}
