"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// One-page PWA install flow. Detects platform + install state on mount
// and renders the single-right-action card for each. "Wrong platform?"
// footer under every card offers three inline overrides — a footnote,
// not a door, so the "one right path" principle stays intact.
//
// Behavior surfaces:
//   installed   → they're already done; CTA opens /chat
//   android     → listen for beforeinstallprompt; if it fires, a real
//                 "Install" button triggers the native dialog. If it
//                 never fires (no SW, already-dismissed, etc.), fall
//                 back to the visual walkthrough.
//   ios-safari  → 3-step visual walkthrough for the iOS share-sheet
//                 install. There's no JS API on iOS; visuals are it.
//   ios-other   → Chrome/Firefox on iOS can't install PWAs. Copy URL,
//                 open Safari.
//   desktop-*   → Chromium gets beforeinstallprompt. Safari 17+ gets
//                 "File → Add to Dock". Firefox gets the "on your
//                 phone" nudge since desktop Firefox doesn't install.

type Platform =
  | "loading"
  | "installed"
  | "android"
  | "ios-safari"
  | "ios-other"
  | "desktop-chromium"
  | "desktop-safari"
  | "desktop-firefox"
  | "unknown";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallFlow() {
  const [detected, setDetected] = useState<Platform>("loading");
  const [override, setOverride] = useState<Platform | null>(null);
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setDetected(detectPlatform());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => {
      setDetected("installed");
      setPromptEvent(null);
    };
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!promptEvent) return;
    setInstalling(true);
    try {
      await promptEvent.prompt();
      const result = await promptEvent.userChoice;
      if (result.outcome === "accepted") {
        setDetected("installed");
      }
    } finally {
      setPromptEvent(null);
      setInstalling(false);
    }
  }, [promptEvent]);

  const platform = override ?? detected;

  if (platform === "loading") return <LoadingCard />;

  const card = (() => {
    switch (platform) {
      case "installed":
        return <InstalledCard />;
      case "android":
        return (
          <AndroidCard
            canPrompt={Boolean(promptEvent)}
            installing={installing}
            onInstall={triggerInstall}
          />
        );
      case "ios-safari":
        return <IOSSafariCard />;
      case "ios-other":
        return <IOSOtherCard />;
      case "desktop-chromium":
        return (
          <DesktopChromiumCard
            canPrompt={Boolean(promptEvent)}
            installing={installing}
            onInstall={triggerInstall}
          />
        );
      case "desktop-safari":
        return <DesktopSafariCard />;
      case "desktop-firefox":
        return <DesktopFirefoxCard />;
      default:
        return <UnknownCard />;
    }
  })();

  return (
    <div className="space-y-4">
      {card}
      {platform !== "installed" ? (
        <WrongPlatform
          current={platform}
          onPick={(p) => setOverride(p === detected ? null : p)}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detection

function detectPlatform(): Platform {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return "loading";
  }

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";

  const ua = navigator.userAgent;
  const isIOS =
    /iPhone|iPad|iPod/.test(ua) ||
    // iPadOS 13+ identifies as desktop Safari unless we sniff touch
    // support. Good-enough heuristic for a 9-person private app.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isCriOS = /CriOS/.test(ua);
  const isFxiOS = /FxiOS/.test(ua);
  const isEdgiOS = /EdgiOS/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);

  if (isIOS) {
    if (isCriOS || isFxiOS || isEdgiOS) return "ios-other";
    return "ios-safari";
  }
  if (isAndroid) return "android";

  if (isSafari) return "desktop-safari";
  if (isFirefox) return "desktop-firefox";
  return "desktop-chromium";
}

// ---------------------------------------------------------------------------
// Cards

function LoadingCard() {
  return (
    <Card>
      <p className={LABEL}>Finding your device…</p>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-bone-900">
        <div className="h-full w-1/3 rounded-full bg-claude-500/40 motion-safe:animate-pulse" />
      </div>
    </Card>
  );
}

function InstalledCard() {
  return (
    <Card accent="success">
      <p className={LABEL}>You&rsquo;re in</p>
      <h2 className={TITLE}>Lazy River is on your device</h2>
      <p className={BODY}>
        Share a link from anywhere — &ldquo;Lazy River&rdquo; now shows
        up in the share sheet. One tap drops it in the library.
      </p>
      <Actions>
        <Link href="/chat" className={BTN_PRIMARY}>
          Open Lazy River
        </Link>
        <Link href="/library" className={BTN_SECONDARY}>
          Go to library
        </Link>
      </Actions>
    </Card>
  );
}

function AndroidCard({
  canPrompt,
  installing,
  onInstall,
}: {
  canPrompt: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  if (canPrompt) {
    return (
      <Card>
        <p className={LABEL}>Android</p>
        <h2 className={TITLE}>One tap. You&rsquo;re done.</h2>
        <p className={BODY}>
          Chrome will show its native install dialog. Confirm and
          you&rsquo;re on the home screen.
        </p>
        <Actions>
          <button
            type="button"
            onClick={onInstall}
            disabled={installing}
            className={BTN_PRIMARY}
          >
            {installing ? "Installing…" : "Install Lazy River"}
          </button>
        </Actions>
      </Card>
    );
  }

  return (
    <Card>
      <p className={LABEL}>Android</p>
      <h2 className={TITLE}>Put it on your home screen</h2>
      <Steps>
        <Step n={1} icon={<MenuIcon />}>
          Open the <strong className="text-bone-50">⋮ menu</strong>{" "}
          (top-right of the browser).
        </Step>
        <Step n={2} icon={<PlusSquareIcon />}>
          Tap <strong className="text-bone-50">Install app</strong> or
          &ldquo;Add to Home screen.&rdquo;
        </Step>
        <Step n={3} icon={<CheckIcon />}>
          Confirm. Lazy River lands on your home screen.
        </Step>
      </Steps>
    </Card>
  );
}

function IOSSafariCard() {
  return (
    <Card>
      <p className={LABEL}>iPhone · Safari</p>
      <h2 className={TITLE}>Drop it on your home screen</h2>
      <Steps>
        <Step n={1} icon={<IOSShareIcon />}>
          Tap the <strong className="text-bone-50">Share</strong>{" "}
          icon at the bottom of Safari (square with an up-arrow).
        </Step>
        <Step n={2} icon={<PlusSquareIcon />}>
          Scroll and tap{" "}
          <strong className="text-bone-50">Add to Home Screen</strong>.
        </Step>
        <Step n={3} icon={<CheckIcon />}>
          Tap <strong className="text-bone-50">Add</strong> (top
          right). Done.
        </Step>
      </Steps>
      <p className={NOTE}>
        When you come back here after installing, this page will flip
        to &ldquo;You&rsquo;re in.&rdquo;
      </p>
    </Card>
  );
}

function IOSOtherCard() {
  return (
    <Card>
      <p className={LABEL}>iPhone</p>
      <h2 className={TITLE}>This trick only works in Safari</h2>
      <p className={BODY}>
        iOS keeps PWA install locked to Safari. Copy this page&rsquo;s
        link, paste it into Safari, and follow the 3-step install
        there.
      </p>
      <div className="mt-4">
        <CopyLinkButton />
      </div>
    </Card>
  );
}

function DesktopChromiumCard({
  canPrompt,
  installing,
  onInstall,
}: {
  canPrompt: boolean;
  installing: boolean;
  onInstall: () => void;
}) {
  if (canPrompt) {
    return (
      <Card>
        <p className={LABEL}>Desktop · Chrome / Edge</p>
        <h2 className={TITLE}>One click. Own window. No tabs.</h2>
        <p className={BODY}>
          Lazy River opens as a standalone app, dock-able, without
          browser chrome in the way.
        </p>
        <Actions>
          <button
            type="button"
            onClick={onInstall}
            disabled={installing}
            className={BTN_PRIMARY}
          >
            {installing ? "Installing…" : "Install Lazy River"}
          </button>
        </Actions>
        <p className={NOTE}>
          Want quick saves without installing?{" "}
          <Link href="/bookmarklet" className="underline hover:text-bone-100">
            Get the desktop bookmarklet →
          </Link>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <p className={LABEL}>Desktop · Chrome / Edge</p>
      <h2 className={TITLE}>Install from the address bar</h2>
      <Steps>
        <Step n={1} icon={<PlusSquareIcon />}>
          Look for the install icon at the right edge of the address
          bar — it looks like a small monitor with a down-arrow.
        </Step>
        <Step n={2} icon={<CheckIcon />}>
          Click it, then confirm{" "}
          <strong className="text-bone-50">Install</strong>.
        </Step>
      </Steps>
      <p className={NOTE}>
        Not seeing the icon?{" "}
        <Link href="/bookmarklet" className="underline hover:text-bone-100">
          Use the bookmarklet instead.
        </Link>
      </p>
    </Card>
  );
}

function DesktopSafariCard() {
  return (
    <Card>
      <p className={LABEL}>Mac · Safari</p>
      <h2 className={TITLE}>Add Lazy River to the Dock</h2>
      <Steps>
        <Step n={1} icon={<MenuIcon />}>
          In the menu bar, choose{" "}
          <strong className="text-bone-50">File → Add to Dock</strong>
          . (Safari 17 or newer.)
        </Step>
        <Step n={2} icon={<CheckIcon />}>
          Confirm the name and icon. It lands in your Dock.
        </Step>
      </Steps>
      <p className={NOTE}>
        Running older Safari or don&rsquo;t want a Dock app?{" "}
        <Link href="/bookmarklet" className="underline hover:text-bone-100">
          Use the bookmarklet instead.
        </Link>
      </p>
    </Card>
  );
}

function DesktopFirefoxCard() {
  return (
    <Card>
      <p className={LABEL}>Desktop · Firefox</p>
      <h2 className={TITLE}>Firefox won&rsquo;t install this</h2>
      <p className={BODY}>
        Firefox on desktop doesn&rsquo;t install web apps. Open this
        page in Chrome, Edge, or Brave for one-click install — or grab
        the bookmarklet for quick saves right here.
      </p>
      <Actions>
        <Link href="/bookmarklet" className={BTN_PRIMARY}>
          Desktop bookmarklet
        </Link>
        <CopyLinkButton variant="secondary" />
      </Actions>
    </Card>
  );
}

function UnknownCard() {
  return (
    <Card>
      <p className={LABEL}>Can&rsquo;t read your device</p>
      <h2 className={TITLE}>Open this on your phone instead</h2>
      <p className={BODY}>
        The real win is installing on your phone — that&rsquo;s what
        enables the one-tap share from anywhere.
      </p>
      <div className="mt-4">
        <CopyLinkButton />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inline override — three text links under every card. Explicit and
// discoverable, but lightweight enough to not undermine the "one right
// path" framing.

type OverridePlatform = Exclude<Platform, "loading" | "installed">;

const OVERRIDE_OPTIONS: { value: OverridePlatform; label: string }[] = [
  { value: "ios-safari", label: "iPhone" },
  { value: "android", label: "Android" },
  { value: "desktop-chromium", label: "Desktop" },
];

function WrongPlatform({
  current,
  onPick,
}: {
  current: Platform;
  onPick: (p: OverridePlatform) => void;
}) {
  return (
    <p className="px-1 pt-2 text-center text-xs text-bone-300">
      <span className="mr-1">Wrong platform?</span>
      {OVERRIDE_OPTIONS.map((o, i) => (
        <span key={o.value}>
          {i > 0 ? <span aria-hidden className="mx-1 text-bone-500">·</span> : null}
          <button
            type="button"
            onClick={() => onPick(o.value)}
            aria-pressed={current === o.value}
            className={
              current === o.value
                ? OVERRIDE_LINK_ACTIVE
                : OVERRIDE_LINK
            }
          >
            {o.label}
          </button>
        </span>
      ))}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Shared UI

function Card({
  children,
  accent,
}: {
  children: React.ReactNode;
  accent?: "success";
}) {
  const border =
    accent === "success"
      ? "border-emerald-500/40"
      : "border-bone-800";
  return (
    <div
      className={`rounded-2xl border ${border} bg-bone-950 p-6 shadow-2xl`}
    >
      {children}
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="mt-5 space-y-4">{children}</ol>;
}

function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-bone-800 bg-bone-900 font-mono text-xs font-semibold text-claude-200"
      >
        {n}
      </span>
      <span aria-hidden="true" className="mt-1 flex-shrink-0 text-bone-200">
        {icon}
      </span>
      <p className="text-pretty text-sm text-bone-100">{children}</p>
    </li>
  );
}

function Actions({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 flex flex-wrap gap-2">{children}</div>;
}

function CopyLinkButton({
  variant = "primary",
}: {
  variant?: "primary" | "secondary";
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — user can still long-press the URL bar */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={variant === "primary" ? BTN_PRIMARY : BTN_SECONDARY}
    >
      {copied ? "Link copied ✓" : "Copy this page\u2019s link"}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Icons — small stroke set. Stylistic approximations (not Apple / Google
// assets) so the page stays trademark-clean. Inherits currentColor.

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 12l4 4 10-10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IOSShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12M8 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 11v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusSquareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M12 8v8M8 12h8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tailwind class constants. Body text uses bone-200 (9.6:1 on bone-950),
// notes use bone-300 (5.6:1) — both pass WCAG 2.1 AA body-text contrast.
// bone-400 (~2.8:1) was dropped for text; only used in decorative glyphs.

const LABEL =
  "text-xs font-semibold uppercase tracking-[0.2em] text-claude-300";
const TITLE =
  "mt-1 text-balance font-display text-xl font-semibold tracking-tight text-bone-50";
const BODY = "mt-3 text-pretty text-sm text-bone-200";
const NOTE = "mt-5 text-pretty text-xs text-bone-300";
const BTN_PRIMARY =
  "inline-flex min-h-[44px] items-center rounded-full border border-claude-500/40 bg-claude-500/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-claude-100 transition-colors hover:bg-claude-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400 disabled:opacity-50 disabled:hover:bg-claude-500/10";
const BTN_SECONDARY =
  "inline-flex min-h-[44px] items-center rounded-full border border-bone-800 px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-bone-300 transition-colors hover:bg-bone-900 hover:text-bone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const OVERRIDE_LINK =
  "rounded px-2 py-1 text-xs font-semibold text-bone-300 underline-offset-4 transition-colors hover:text-bone-100 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
const OVERRIDE_LINK_ACTIVE =
  "rounded px-2 py-1 text-xs font-semibold text-claude-200 underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400";
