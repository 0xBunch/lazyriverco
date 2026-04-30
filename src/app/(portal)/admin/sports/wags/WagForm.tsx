"use client";

import { useState, useTransition } from "react";
import {
  createWag,
  lookupWagDraft,
  updateWag,
  type WagLookupResponse,
} from "./actions";
import { WagImageUpload } from "./WagImageUpload";

// Client-component WAG form. Holds form state so the "Auto-fill from
// athlete name" button can pre-populate fields without a full page
// reload, then submits via the existing createWag / updateWag server
// actions. The list below the form stays server-rendered.

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;
const CONFIDENCE = ["high", "medium", "low"] as const;

export type EditingWag = {
  id: string;
  name: string;
  athleteName: string;
  sport: string;
  team: string | null;
  imageUrl: string;
  imageR2Key: string | null;
  instagramHandle: string | null;
  caption: string | null;
  notableFact: string | null;
  sourceUrl: string | null;
  confidence: string;
};

type FormState = {
  name: string;
  athleteName: string;
  sport: string;
  team: string;
  imageUrl: string;
  imageR2Key: string;
  instagramHandle: string;
  caption: string;
  notableFact: string;
  sourceUrl: string;
  confidence: string;
  /// Only set when the auto-fill action succeeds. Submitted as a
  /// hidden field so the create/update action can stamp checkedAt
  /// on the new row. Empty string means "no fresh AI verification."
  aiCheckedAt: string;
};

function blank(editing: EditingWag | null): FormState {
  return {
    name: editing?.name ?? "",
    athleteName: editing?.athleteName ?? "",
    sport: editing?.sport ?? "NFL",
    team: editing?.team ?? "",
    imageUrl: editing?.imageUrl ?? "",
    imageR2Key: editing?.imageR2Key ?? "",
    instagramHandle: editing?.instagramHandle ?? "",
    caption: editing?.caption ?? "",
    notableFact: editing?.notableFact ?? "",
    sourceUrl: editing?.sourceUrl ?? "",
    confidence: editing?.confidence ?? "high",
    aiCheckedAt: "",
  };
}

export function WagForm({
  editing,
  r2PublicBase,
}: {
  editing: EditingWag | null;
  /// NEXT_PUBLIC_R2_PUBLIC_BASE_URL forwarded from the server. Empty
  /// string when R2 isn't configured; the upload widget still renders
  /// but the presign endpoint will return a clean error and the widget
  /// surfaces it.
  r2PublicBase: string;
}) {
  const [form, setForm] = useState<FormState>(() => blank(editing));
  const [isLooking, startLookup] = useTransition();
  const [lookupNote, setLookupNote] = useState<{
    tone: "ok" | "warn";
    text: string;
  } | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onLookup() {
    setLookupNote(null);
    if (!form.athleteName.trim()) {
      setLookupNote({ tone: "warn", text: "Enter an athlete name first." });
      return;
    }
    const fd = new FormData();
    fd.set("athleteName", form.athleteName);
    fd.set("sport", form.sport);
    if (form.team) fd.set("team", form.team);
    startLookup(async () => {
      let resp: WagLookupResponse;
      try {
        resp = await lookupWagDraft(fd);
      } catch (err) {
        setLookupNote({
          tone: "warn",
          text: err instanceof Error ? err.message : "Lookup failed.",
        });
        return;
      }
      if (!resp.ok) {
        setLookupNote({ tone: "warn", text: resp.error });
        return;
      }
      const r = resp.result;
      setForm((f) => ({
        ...f,
        // Only overwrite empty fields so an admin who's already typed in
        // a partner name or caption doesn't lose their work. Empty
        // imageUrl gets filled even when Gemini's image proxy URL would
        // fail validation client-side — server action runs sanitization
        // again on submit.
        name: f.name || r.name || "",
        imageUrl: f.imageUrl || r.imageUrl || "",
        instagramHandle: f.instagramHandle || r.instagramHandle || "",
        caption: f.caption || r.notableFact?.slice(0, 280) || "",
        notableFact: f.notableFact || r.notableFact || "",
        sourceUrl: f.sourceUrl || r.sourceUrl || "",
        // Always overwrite confidence + stamp the verification time —
        // those are the freshest signals from the lookup.
        confidence: r.confidence,
        aiCheckedAt: new Date().toISOString(),
      }));
      const filled = [
        r.name ? "name" : null,
        r.imageUrl ? "image" : null,
        r.instagramHandle ? "@handle" : null,
        r.notableFact ? "caption + notable fact" : null,
        r.sourceUrl ? "source" : null,
      ]
        .filter(Boolean)
        .join(", ");
      setLookupNote({
        tone: "ok",
        text: filled
          ? `Filled: ${filled} (confidence: ${r.confidence}). Review before saving.`
          : `No fields could be filled (confidence: ${r.confidence}).`,
      });
    });
  }

  const initialPublicUrl =
    editing?.imageR2Key && r2PublicBase
      ? `${r2PublicBase.replace(/\/+$/, "")}/${editing.imageR2Key}`
      : null;

  return (
    <form
      action={editing ? updateWag : createWag}
      className="space-y-3 rounded-2xl border border-bone-700 bg-bone-900 p-5"
    >
      <div className="flex items-center justify-between">
        <p className="font-display text-sm font-semibold text-bone-50">
          {editing ? `Edit ${editing.name}` : "Add a WAG"}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLookup}
            disabled={isLooking || !form.athleteName.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-claude-700/50 bg-claude-950/30 px-3 py-1.5 text-xs font-medium text-claude-200 transition-colors hover:border-claude-500 hover:bg-claude-900/40 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-500"
            title="Run the same Gemini + Google Search pipeline as WAGFINDER and pre-fill the empty fields below."
          >
            {isLooking ? "Combing the open web…" : "Auto-fill from athlete name"}
          </button>
        </div>
      </div>
      {lookupNote && (
        <p
          className={
            lookupNote.tone === "ok"
              ? "rounded-md border border-emerald-700/40 bg-emerald-900/20 px-3 py-1.5 text-xs text-emerald-200"
              : "rounded-md border border-amber-700/40 bg-amber-900/20 px-3 py-1.5 text-xs text-amber-200"
          }
        >
          {lookupNote.text}
        </p>
      )}
      {editing && <input type="hidden" name="id" value={editing.id} />}
      <input type="hidden" name="imageR2Key" value={form.imageR2Key} />
      <input type="hidden" name="aiCheckedAt" value={form.aiCheckedAt} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="name"
          placeholder="Partner name (e.g. Ciara Wilson)"
          required
          maxLength={120}
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          className={inputCls}
        />
        <input
          name="athleteName"
          placeholder="Athlete name (e.g. Russell Wilson)"
          required
          maxLength={120}
          value={form.athleteName}
          onChange={(e) => update("athleteName", e.target.value)}
          className={inputCls}
        />
        <select
          name="sport"
          required
          value={form.sport}
          onChange={(e) => update("sport", e.target.value)}
          className={inputCls}
        >
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          name="team"
          placeholder="Team (optional, e.g. Pittsburgh Steelers)"
          maxLength={80}
          value={form.team}
          onChange={(e) => update("team", e.target.value)}
          className={inputCls}
        />
        <input
          name="imageUrl"
          type="url"
          placeholder="https://… image URL (or use the upload below)"
          required
          maxLength={2048}
          value={form.imageUrl}
          onChange={(e) => update("imageUrl", e.target.value)}
          className={`${inputCls} sm:col-span-2`}
        />
        <WagImageUpload
          initialKey={editing?.imageR2Key ?? null}
          initialPublicUrl={initialPublicUrl}
          onUploaded={({ key, publicUrl }) =>
            setForm((f) => ({ ...f, imageR2Key: key, imageUrl: publicUrl }))
          }
          onCleared={() => setForm((f) => ({ ...f, imageR2Key: "" }))}
        />
        <input
          name="instagramHandle"
          type="text"
          placeholder="Instagram handle (optional, no @)"
          maxLength={80}
          value={form.instagramHandle}
          onChange={(e) => update("instagramHandle", e.target.value)}
          className={inputCls}
        />
        <input
          name="caption"
          placeholder="Editorial caption (optional, ≤280 chars)"
          maxLength={280}
          value={form.caption}
          onChange={(e) => update("caption", e.target.value)}
          className={inputCls}
        />
        <input
          name="notableFact"
          placeholder="Notable fact (optional, ≤240 chars — public-facing)"
          maxLength={240}
          value={form.notableFact}
          onChange={(e) => update("notableFact", e.target.value)}
          className={`${inputCls} sm:col-span-2`}
        />
        <input
          name="sourceUrl"
          type="url"
          placeholder="Source URL (optional, whitelisted domains only)"
          maxLength={512}
          value={form.sourceUrl}
          onChange={(e) => update("sourceUrl", e.target.value)}
          className={inputCls}
        />
        <select
          name="confidence"
          required
          value={form.confidence}
          onChange={(e) => update("confidence", e.target.value)}
          className={inputCls}
          title="High = admin-curated or Wikipedia. Medium = reputable outlet. Low = thin sourcing — surfaces a 'low confidence' pill on /sports."
        >
          {CONFIDENCE.map((c) => (
            <option key={c} value={c}>
              confidence: {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        {editing && (
          <a
            href="/admin/sports/wags"
            className="rounded-lg border border-bone-700 px-4 py-2 text-sm text-bone-300 hover:bg-bone-800"
          >
            Cancel
          </a>
        )}
        <button
          type="submit"
          className="rounded-lg bg-claude-600 px-4 py-2 text-sm font-medium text-bone-50 hover:bg-claude-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-claude-400"
        >
          {editing ? "Save changes" : "Add WAG"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "rounded-lg border border-bone-700 bg-bone-950 px-3 py-2 text-sm text-bone-50 placeholder-bone-500 focus:border-claude-500 focus:outline-none focus:ring-1 focus:ring-claude-500";
