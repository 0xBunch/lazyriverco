// Seed script for The Lazy River Company.
//
// Two entry points:
//   `tsx prisma/seed.ts`          → idempotent upsert path. Safe to re-run any time.
//                                    `Character.systemPrompt` is write-on-create only,
//                                    so Task 08's real bibles survive re-runs.
//   `tsx prisma/seed.ts --reset`  → destructive: wipes Message/PlayerPool/Character/User
//                                    (Roster + LineupDecision cascade via schema).
//                                    Gated behind RESEED_OK=true env var.

import { Prisma, PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();
const SEASON = Number(process.env.SEED_SEASON ?? 2026);

const USERS: Prisma.UserCreateInput[] = [
  { name: "KB", displayName: "KB", role: Role.ADMIN },
  { name: "Joey Fan 1", displayName: "Joey Fan 1", role: Role.MEMBER },
  { name: "Joey Fan 2", displayName: "Joey Fan 2", role: Role.MEMBER },
  { name: "Joey Fan 3", displayName: "Joey Fan 3", role: Role.MEMBER },
  { name: "Joey Fan 4", displayName: "Joey Fan 4", role: Role.MEMBER },
  { name: "Joey Fan 5", displayName: "Joey Fan 5", role: Role.MEMBER },
  { name: "Joey Fan 6", displayName: "Joey Fan 6", role: Role.MEMBER },
];

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

async function seedIdempotent() {
  await prisma.$transaction(
    async (tx) => {
      for (const u of USERS) {
        await tx.user.upsert({
          where: { name: u.name },
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
    },
    { timeout: 30_000 },
  );
}

async function seedReset() {
  if (process.env.RESEED_OK !== "true") {
    throw new Error(
      "db:seed:reset requires RESEED_OK=true. This destroys Message/PlayerPool/Character/User data. Aborting.",
    );
  }

  await prisma.$transaction(
    async (tx) => {
      // Order: children first where cascade doesn't cover them.
      // Character.onDelete: Cascade handles Roster → LineupDecision automatically.
      await tx.message.deleteMany({});
      await tx.playerPool.deleteMany({ where: { season: SEASON } });
      await tx.character.deleteMany({});
      await tx.user.deleteMany({});

      for (const u of USERS) {
        await tx.user.create({ data: u });
      }
      for (const c of CHARACTERS) {
        await tx.character.create({ data: c });
      }
      for (const p of PLAYER_POOL) {
        await tx.playerPool.create({ data: { ...p, season: SEASON } });
      }
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

  const [userCount, characterCount, playerPoolCount] = await Promise.all([
    prisma.user.count(),
    prisma.character.count(),
    prisma.playerPool.count({ where: { season: SEASON } }),
  ]);
  console.log(
    `Seed complete. users=${userCount} characters=${characterCount} playerPool(season=${SEASON})=${playerPoolCount}`,
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
