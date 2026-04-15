// Seed script for The Lazy River Company.
//
// Two entry points:
//   `tsx prisma/seed.ts`          → idempotent upsert path. Safe to re-run any time.
//                                    `Character.systemPrompt` is write-on-create only,
//                                    so Task 08's real bibles survive re-runs.
//   `tsx prisma/seed.ts --reset`  → destructive: wipes Message/PlayerPool/Character/User
//                                    (Roster + LineupDecision cascade via schema).
//                                    Gated behind RESEED_OK=true env var.

import bcrypt from "bcryptjs";
import { Prisma, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const SEASON = Number(process.env.SEED_SEASON ?? 2026);
const BCRYPT_ROUNDS = 12;

const USER_TEMPLATES = [
  { name: "maverick", displayName: "Maverick", role: Role.ADMIN },
  { name: "choobs", displayName: "Choobs", role: Role.MEMBER },
  { name: "bismarck", displayName: "Bismarck", role: Role.MEMBER },
  { name: "chief", displayName: "Chief", role: Role.MEMBER },
  { name: "blackie", displayName: "Blackie", role: Role.MEMBER },
  { name: "ron", displayName: "Ron", role: Role.MEMBER },
  { name: "mango", displayName: "Mango", role: Role.MEMBER },
] as const;

function loadCredentials(): Map<string, string> {
  const raw = process.env.SEED_CREDENTIALS;
  if (!raw) {
    throw new Error(
      "SEED_CREDENTIALS env var is not set. Add it to .env.local as a JSON array of { name, password } for the 7 seeded users before running the seed.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      `SEED_CREDENTIALS is not valid JSON: ${(e as Error).message}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("SEED_CREDENTIALS must be a JSON array");
  }
  const map = new Map<string, string>();
  for (const entry of parsed) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { name?: unknown }).name !== "string" ||
      typeof (entry as { password?: unknown }).password !== "string"
    ) {
      throw new Error(
        "SEED_CREDENTIALS entries must be { name: string, password: string }",
      );
    }
    const { name, password } = entry as { name: string; password: string };
    map.set(name, password);
  }
  for (const tpl of USER_TEMPLATES) {
    if (!map.has(tpl.name)) {
      throw new Error(`SEED_CREDENTIALS is missing an entry for "${tpl.name}"`);
    }
  }
  return map;
}

async function buildUsers(): Promise<Prisma.UserCreateInput[]> {
  const creds = loadCredentials();
  const users: Prisma.UserCreateInput[] = [];
  // Sequential loop, not Promise.all: bcrypt.hash is CPU-bound so parallel
  // hashing gives no wall-clock benefit and worsens stack traces on failure.
  for (const tpl of USER_TEMPLATES) {
    const password = creds.get(tpl.name);
    if (!password) {
      throw new Error(`Missing password for "${tpl.name}"`);
    }
    users.push({
      name: tpl.name,
      displayName: tpl.displayName,
      role: tpl.role,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    });
  }
  return users;
}

const CHARACTERS: Prisma.CharacterCreateInput[] = [
  {
    name: "joey-barfdog",
    displayName: 'Joey "Barfdog" Freedman',
    systemPrompt:
      "You are Joey 'Barfdog' Freedman, a delusionally confident fantasy football manager. Placeholder — replaced in Task 08.",
    isFantasyManager: true,
    triggerKeywords: [
      "fantasy",
      "draft",
      "lineup",
      "waiver",
      "trade",
      "quarterback",
      "touchdown",
      "barfdog",
      "joey",
    ],
    responseProbability: 0.6,
    activeModules: ["chat", "fantasy", "picks", "leaderboard"],
    active: true,
  },
  {
    name: "billy-sarracino",
    displayName: "Billy Sarracino",
    systemPrompt:
      "You are Billy Sarracino, the group's eternal punching bag. Placeholder — replaced in Task 08.",
    isFantasyManager: false,
    triggerKeywords: ["billy", "sarracino", "loser", "last place", "worst"],
    responseProbability: 0.4,
    activeModules: ["chat", "media"],
    active: true,
  },
  {
    name: "andreea-illiescu",
    displayName: "Andreea Illiescu",
    systemPrompt:
      "You are Andreea Illiescu, a glamorous woman who is best friends with Sofia Vergara. Placeholder — replaced in Task 08.",
    isFantasyManager: false,
    triggerKeywords: [
      "andreea",
      "sofia",
      "vergara",
      "celebrity",
      "party",
      "gorgeous",
      "hot",
      "fashion",
    ],
    responseProbability: 0.3,
    activeModules: ["chat", "media"],
    active: true,
  },
];

type PlayerSeed = Omit<Prisma.PlayerPoolCreateInput, "season">;

const PLAYER_POOL: PlayerSeed[] = [
  { playerName: "Aaron Rodgers", position: "QB", team: "Free Agent", tagline: "Still thinks ayahuasca is a playbook." },
  { playerName: "Zach Wilson", position: "QB", team: "Free Agent", tagline: "His mom begged the Jets to start him." },
  { playerName: "Russell Wilson", position: "QB", team: "Free Agent", tagline: "Let Russ cook (on the bench)." },
  { playerName: "Baker Mayfield", position: "QB", team: "Buccaneers", tagline: "Progressive spokesman, regressive QB." },
  { playerName: "Daniel Jones", position: "QB", team: "Free Agent", tagline: "Danny Dimes became Danny Nickels." },
  { playerName: "Kenny Pickett", position: "QB", team: "Free Agent", tagline: "The small-hands truther." },
  { playerName: "Mitchell Trubisky", position: "QB", team: "Free Agent", tagline: "Drafted ahead of Mahomes. Never recovered." },
  { playerName: "Carson Wentz", position: "QB", team: "Free Agent", tagline: "MVP candidate → seven teams in eight years." },
  { playerName: "Jimmy Garoppolo", position: "QB", team: "Free Agent", tagline: "Handsomest interception machine in football." },
  { playerName: "Joe Flacco", position: "QB", team: "Free Agent", tagline: "Elite, once, in 2013." },
  { playerName: "Matt Ryan", position: "QB", team: "Free Agent", tagline: "28-3 is still trending." },
  { playerName: "Sam Darnold", position: "QB", team: "Free Agent", tagline: "Sees ghosts. Literal ones." },
  { playerName: "Davis Mills", position: "QB", team: "Free Agent", tagline: "The Texans' plan C, year three." },
  { playerName: "Gardner Minshew", position: "QB", team: "Free Agent", tagline: "All mustache, no ceiling." },
  { playerName: "Jameis Winston", position: "QB", team: "Free Agent", tagline: "30 for 30. 30 TDs, 30 INTs." },
  { playerName: "Zay Jones", position: "WR", team: "Free Agent", tagline: "More drops than catches most weeks." },
  { playerName: "Dalvin Cook", position: "RB", team: "Free Agent", tagline: "Looked done the second he left Minnesota." },
  { playerName: "Leonard Fournette", position: "RB", team: "Free Agent", tagline: "Playoff Lenny retired in the regular season." },
  { playerName: "Cam Akers", position: "RB", team: "Free Agent", tagline: "Tore the same achilles twice." },
  { playerName: "Allen Robinson", position: "WR", team: "Free Agent", tagline: "Still waiting on a competent QB." },
];

// Sample chat for TASK 05. Each entry picks its author by name; offsetMin is
// how many minutes ago the message was "sent". Only planted when the Message
// table is empty so re-running the seed doesn't dupe.
type SeedMessage =
  | { kind: "user"; name: string; content: string; offsetMin: number }
  | { kind: "character"; name: string; content: string; offsetMin: number };

const SAMPLE_MESSAGES: SeedMessage[] = [
  { kind: "user", name: "choobs", content: "draft this weekend, who's ready", offsetMin: 65 },
  { kind: "character", name: "joey-barfdog", content: "brothers, i've done the research. trust the process... year of the barfdog", offsetMin: 64 },
  { kind: "user", name: "bismarck", content: "joey you finished 9th last year", offsetMin: 60 },
  { kind: "character", name: "joey-barfdog", content: "bad luck, not bad management", offsetMin: 59 },
  { kind: "user", name: "maverick", content: "commissioner here. draft order finalized tuesday.", offsetMin: 42 },
  { kind: "character", name: "billy-sarracino", content: "ok first of all that's not even what happened 😤", offsetMin: 28 },
  { kind: "user", name: "chief", content: "billy nobody said anything", offsetMin: 25 },
  { kind: "character", name: "billy-sarracino", content: "look just forget it", offsetMin: 24 },
  { kind: "user", name: "mango", content: "andreea you coming to the draft party?", offsetMin: 12 },
  { kind: "character", name: "andreea-illiescu", content: "darling, sofia and i were in saint-tropez last week. miami is... cute.", offsetMin: 11 },
  { kind: "user", name: "ron", content: "lmao", offsetMin: 8 },
  { kind: "user", name: "blackie", content: "we need a QB tier list before tuesday", offsetMin: 3 },
];

async function seedIdempotent() {
  const users = await buildUsers();
  await prisma.$transaction(
    async (tx) => {
      for (const u of users) {
        await tx.user.upsert({
          where: { name: u.name },
          // passwordHash intentionally omitted from update — write-on-create only,
          // so a user who rotates their password doesn't get reset on seed re-run.
          update: { displayName: u.displayName, role: u.role },
          create: u,
        });
      }
      for (const c of CHARACTERS) {
        await tx.character.upsert({
          where: { name: c.name },
          // systemPrompt intentionally omitted from update — write-on-create only,
          // so Task 08's real Character Bibles survive re-runs.
          update: {
            displayName: c.displayName,
            isFantasyManager: c.isFantasyManager,
            triggerKeywords: c.triggerKeywords,
            responseProbability: c.responseProbability,
            activeModules: c.activeModules,
            active: c.active,
          },
          create: c,
        });
      }
      for (const p of PLAYER_POOL) {
        await tx.playerPool.upsert({
          where: {
            playerName_season: { playerName: p.playerName, season: SEASON },
          },
          update: {
            position: p.position,
            team: p.team,
            tagline: p.tagline,
          },
          create: { ...p, season: SEASON },
        });
      }

      // Sample chat messages — only if the table is empty, so re-runs don't dupe.
      const existing = await tx.message.count();
      if (existing === 0) {
        await seedMessages(tx);
      }
    },
    { timeout: 30_000 },
  );
}

async function seedMessages(tx: Prisma.TransactionClient) {
  const [userRows, characterRows] = await Promise.all([
    tx.user.findMany({ select: { id: true, name: true } }),
    tx.character.findMany({ select: { id: true, name: true } }),
  ]);
  const userByName = new Map(userRows.map((u) => [u.name, u.id]));
  const characterByName = new Map(characterRows.map((c) => [c.name, c.id]));

  const now = Date.now();
  for (const msg of SAMPLE_MESSAGES) {
    const createdAt = new Date(now - msg.offsetMin * 60_000);
    if (msg.kind === "user") {
      const userId = userByName.get(msg.name);
      if (!userId) throw new Error(`Seed message: unknown user "${msg.name}"`);
      await tx.message.create({
        data: {
          content: msg.content,
          authorType: "USER",
          userId,
          createdAt,
        },
      });
    } else {
      const characterId = characterByName.get(msg.name);
      if (!characterId) {
        throw new Error(`Seed message: unknown character "${msg.name}"`);
      }
      await tx.message.create({
        data: {
          content: msg.content,
          authorType: "CHARACTER",
          characterId,
          createdAt,
        },
      });
    }
  }
}

async function seedReset() {
  if (process.env.RESEED_OK !== "true") {
    throw new Error(
      "db:seed:reset requires RESEED_OK=true. This destroys Message/PlayerPool/Character/User data. Aborting.",
    );
  }

  const users = await buildUsers();
  await prisma.$transaction(
    async (tx) => {
      // Order: children first where cascade doesn't cover them.
      // Character.onDelete: Cascade handles Roster → LineupDecision automatically.
      await tx.message.deleteMany({});
      await tx.playerPool.deleteMany({ where: { season: SEASON } });
      await tx.character.deleteMany({});
      await tx.user.deleteMany({});

      for (const u of users) {
        await tx.user.create({ data: u });
      }
      for (const c of CHARACTERS) {
        await tx.character.create({ data: c });
      }
      for (const p of PLAYER_POOL) {
        await tx.playerPool.create({ data: { ...p, season: SEASON } });
      }
      await seedMessages(tx);
    },
    { timeout: 30_000 },
  );
}

async function main() {
  const isReset = process.argv.includes("--reset");
  if (isReset) {
    console.log("Running destructive reset seed...");
    await seedReset();
  } else {
    console.log("Running idempotent upsert seed...");
    await seedIdempotent();
  }

  const [userCount, characterCount, playerPoolCount, messageCount] =
    await Promise.all([
      prisma.user.count(),
      prisma.character.count(),
      prisma.playerPool.count({ where: { season: SEASON } }),
      prisma.message.count(),
    ]);
  console.log(
    `Seed complete. users=${userCount} characters=${characterCount} playerPool(season=${SEASON})=${playerPoolCount} messages=${messageCount}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
