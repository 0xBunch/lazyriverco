import { ImageResponse } from "next/og";

// Favicon — a pink "L" on a warm dark square, matching the Claude-style
// theme (bone-950 bg / claude-500 accent). Next 14 generates this at build
// time via ImageResponse so we don't need a static .ico file.
export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#141311",
          color: "#D957A3",
          fontSize: 24,
          fontWeight: 800,
          fontFamily: "sans-serif",
          borderRadius: 6,
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
