import { InstallFlow } from "./_install";

// /app — the one URL KB sends to members to install Lazy River as a PWA.
// Principle: no matrix of platform instructions; detect and show the
// ONE right path. Nine users, varied devices — each visitor should see
// a single obvious next action, not a taxonomy of options.
//
// The flow is entirely client-side (platform detection, install-prompt
// event, standalone-mode check). This server component is just the
// page shell; _install.tsx owns the state machine.

export const dynamic = "force-dynamic";

export default function AppInstallPage() {
  return (
    <div className="mx-auto mt-12 w-full max-w-xl px-4 pb-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claude-300">
        Lazy River
      </p>
      <h1 className="mt-1 text-balance font-display text-2xl font-semibold tracking-tight text-bone-50">
        Get it on your phone
      </h1>
      <p className="mt-3 text-pretty text-sm text-bone-200">
        One tap from any app drops a link or photo straight into the
        library — no visit required.
      </p>

      <div className="mt-8">
        <InstallFlow />
      </div>
    </div>
  );
}
