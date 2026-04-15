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
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            The Lazy River Co.
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Float in, MLF.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="username"
              className="mb-1 block text-sm font-medium text-slate-300"
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
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-river-500 focus:outline-none focus:ring-1 focus:ring-river-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-300"
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
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-river-500 focus:outline-none focus:ring-1 focus:ring-river-500"
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
            className="w-full rounded-lg bg-river-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-river-50 focus:outline-none focus:ring-2 focus:ring-river-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Floating in…" : "Float In"}
          </button>
        </form>
      </div>
    </main>
  );
}
