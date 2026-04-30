"use client";

import { useState, useTransition } from "react";
import {
  createWag,
  lookupWagDraft,
  updateWag,
  type WagLookupResponse,
} from "./actions";

// Client-component WAG form. Holds form state so the "Auto-fill from
// athlete name" button can pre-populate fields without a full page
// reload, then submits via the existing createWag / updateWag server
// actions. The list below the form stays server-rendered.

const SPORTS = ["NFL", "NBA", "MLB", "NHL", "MLS", "UFC"] as const;

type EditingWag = {
  id: string;
  name: string;
  athleteName: string;
  sport: string;
  team: string | null;
  imageUrl: string;
  instagramHandle: string | null;
  caption: string | null;
};

type FormState = {
  name: string;
  athleteName: string;
  sport: string;
  team: string;
  imageUrl: string;
  instagramHandle: string;
  caption: string;
};

function blank(editing: EditingWag | null): FormState {
  return {
    name: editing?.name ?? "",
    athleteName: editing?.athleteName ?? "",
    sport: editing?.sport ?? "NFL",
    team: editing?.team ?? "",
    imageUrl: editing?.imageUrl ?? "",
    instagramHandle: editing?.instagramHandle ?? "",
    caption: editing?.caption ?? "",
  };
}

export function WagForm({ editing }: { editing: EditingWag | null }) {
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
      }));
      const filled = [
        r.name ? "name" : null,
        r.imageUrl ? "image" : null,
        r.instagramHandle ? "@handle" : null,
        r.notableFact ? "caption" : null,
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
          placeholder="https://… image URL"
          required
          maxLength={2048}
          value={form.imageUrl}
          onChange={(e) => update("imageUrl", e.target.value)}
          className={`${inputCls} sm:col-span-2`}
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
