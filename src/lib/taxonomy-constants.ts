// Constants safe to import from either client or server. The main
// taxonomy module (src/lib/ai-taxonomy.ts) has `import "server-only"`
// because it touches Prisma; splitting the label constants out lets
// client components reference them without dragging the server-only
// barrier through the bundle.

export const BANNED_LABEL = "banned" as const;
