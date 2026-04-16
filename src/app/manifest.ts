import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "The Lazy River Co.",
    short_name: "Lazy River",
    description: "Corporate extranet of the Lazy River Corporation, a subsidiary of Mens League.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#141311",
    theme_color: "#141311",
    icons: [
      {
        src: "/icon.png",
        sizes: "436x436",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "436x436",
        type: "image/png",
      },
    ],
  };
}
