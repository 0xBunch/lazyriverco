// Curated Lucide icon allowlist for prompt suggestion groups and items.
// The full lucide-react export is ~1000 icons; this file narrows it to a
// themed set (writing, creativity, sports/fantasy, humor, analysis,
// broadcast, sound) so the admin picker is a scannable grid rather than
// a search box. Add an entry here, re-deploy, and the new icon shows up
// in /admin/prompts immediately.
//
// Names are Lucide's PascalCase (NOT kebab). The DB stores the key as-
// written — server-side validation (parseIconName in admin/prompts/
// actions.ts) rejects anything not in this map, and render-side
// getPromptIcon returns null for unknown names so trimming the list
// never strands rows.

import {
  Activity,
  BarChart3,
  BookOpen,
  Crown,
  Crosshair,
  Dice6,
  Feather,
  FileText,
  Flame,
  Ghost,
  Headphones,
  Heart,
  Laugh,
  Lightbulb,
  Medal,
  Megaphone,
  Meh,
  MessageCircle,
  Mic,
  Music,
  Newspaper,
  Pen,
  PencilLine,
  PenTool,
  Quote,
  Radio,
  Rocket,
  Scroll,
  Shield,
  Smile,
  Sparkles,
  Star,
  Swords,
  Target,
  TrendingUp,
  Trophy,
  Tv,
  Type,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";

export const PROMPT_ICONS: Record<string, LucideIcon> = {
  Pen,
  PenTool,
  PencilLine,
  Type,
  Feather,
  Flame,
  Zap,
  Sparkles,
  Star,
  Trophy,
  Target,
  Crosshair,
  Swords,
  Shield,
  Medal,
  Heart,
  Ghost,
  Laugh,
  Smile,
  Meh,
  Wand2,
  Crown,
  Rocket,
  Lightbulb,
  Quote,
  MessageCircle,
  Megaphone,
  Mic,
  Radio,
  Tv,
  BarChart3,
  TrendingUp,
  Activity,
  Dice6,
  Newspaper,
  BookOpen,
  Scroll,
  FileText,
  Music,
  Headphones,
};

export type PromptIconName = keyof typeof PROMPT_ICONS;

/** Narrows a raw icon name (from DB or form) into a renderable Lucide
 * component, or null if unknown. Never throws. Uses `Object.hasOwn` to
 * dodge prototype chain hits like "toString" that would otherwise
 * resolve to a non-component function. */
export function getPromptIcon(name: string | null): LucideIcon | null {
  if (!name) return null;
  if (!Object.hasOwn(PROMPT_ICONS, name)) return null;
  return PROMPT_ICONS[name];
}

/** Sorted names for rendering in the admin picker grid. */
export const PROMPT_ICON_NAMES: readonly PromptIconName[] =
  Object.keys(PROMPT_ICONS) as PromptIconName[];
