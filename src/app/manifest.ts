import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Lazy River Co.",
    short_name: "Lazy River",
    description: "Private portal for the MLF.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#141311",
    theme_color: "#141311",
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
