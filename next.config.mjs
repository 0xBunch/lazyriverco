/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permanent (308) redirects from the pre-condensation admin paths to
  // their new homes under /admin/ai/*. Source dirs are flat today, but
  // we add :path* defensively so any future nested route (or a stale
  // bookmark with query/segments tacked on) still lands cleanly. Two
  // rules per move: bare path and :path* — Next won't match the bare
  // form against the :path* pattern alone. Added in PR 2 of the admin
  // condensation series.
  async redirects() {
    return [
      {
        source: "/admin/agents",
        destination: "/admin/ai/personas",
        permanent: true,
      },
      {
        source: "/admin/agents/:path*",
        destination: "/admin/ai/personas/:path*",
        permanent: true,
      },
      {
        source: "/admin/relationships",
        destination: "/admin/ai/opinions",
        permanent: true,
      },
      {
        source: "/admin/relationships/:path*",
        destination: "/admin/ai/opinions/:path*",
        permanent: true,
      },
      {
        source: "/admin/prompts",
        destination: "/admin/ai/prompts",
        permanent: true,
      },
      {
        source: "/admin/prompts/:path*",
        destination: "/admin/ai/prompts/:path*",
        permanent: true,
      },
      // PR 3 of the admin condensation: Memory umbrella absorbs canon,
      // lore, library, taxonomy, feeds.
      {
        source: "/admin/canon",
        destination: "/admin/memory/canon",
        permanent: true,
      },
      {
        source: "/admin/canon/:path*",
        destination: "/admin/memory/canon/:path*",
        permanent: true,
      },
      {
        source: "/admin/lore",
        destination: "/admin/memory/lore",
        permanent: true,
      },
      {
        source: "/admin/lore/:path*",
        destination: "/admin/memory/lore/:path*",
        permanent: true,
      },
      {
        source: "/admin/library",
        destination: "/admin/memory/library",
        permanent: true,
      },
      {
        source: "/admin/library/:path*",
        destination: "/admin/memory/library/:path*",
        permanent: true,
      },
      {
        source: "/admin/taxonomy",
        destination: "/admin/memory/taxonomy",
        permanent: true,
      },
      {
        source: "/admin/taxonomy/:path*",
        destination: "/admin/memory/taxonomy/:path*",
        permanent: true,
      },
      {
        source: "/admin/feeds",
        destination: "/admin/memory/feeds",
        permanent: true,
      },
      {
        source: "/admin/feeds/:path*",
        destination: "/admin/memory/feeds/:path*",
        permanent: true,
      },
      // PR 4 of the admin condensation: Usage moves under Members.
      // /admin/members itself stays as the umbrella (its page.tsx
      // server-redirects to /admin/members/roster — no next.config
      // entry needed because the source still resolves to a real
      // route).
      {
        source: "/admin/usage",
        destination: "/admin/members/usage",
        permanent: true,
      },
      {
        source: "/admin/usage/:path*",
        destination: "/admin/members/usage/:path*",
        permanent: true,
      },
      // PR 5 of the admin condensation: Draft moves under
      // /admin/sports/mlf/* alongside future sports apps and MLF
      // surfaces. The draft tree has nested subroutes (/[id]/setup,
      // /pool, /images, /sponsors) so :path* is load-bearing here, not
      // just defensive.
      {
        source: "/admin/draft",
        destination: "/admin/sports/mlf/draft",
        permanent: true,
      },
      {
        source: "/admin/draft/:path*",
        destination: "/admin/sports/mlf/draft/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    // R2 public objects are served from NEXT_PUBLIC_R2_PUBLIC_BASE_URL.
    // next/image refuses to optimize arbitrary remote hosts without an
    // explicit pattern, so derive from the env at config time (this file
    // runs at build, not request, so NEXT_PUBLIC_* is fine).
    //
    // Dev note: if the env isn't set yet, the pattern array is empty and
    // next/image falls back to failing loudly on any remote src — that's
    // the right posture until the bucket is provisioned.
    remotePatterns: (() => {
      const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
      if (!base) return [];
      try {
        const u = new URL(base);
        return [
          {
            protocol: u.protocol.replace(":", ""),
            hostname: u.hostname,
            pathname: "/**",
          },
        ];
      } catch {
        return [];
      }
    })(),
  },
};

export default nextConfig;
