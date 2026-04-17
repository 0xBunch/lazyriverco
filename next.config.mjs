/** @type {import('next').NextConfig} */
const nextConfig = {
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
