import { ImageResponse } from "next/og";

// Apple Touch Icon — 180x180 version of the favicon for iOS "Add to Home
// Screen". Larger corner radius and bolder glyph to read well at icon size.
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 128,
          fontWeight: 800,
          fontFamily: "serif",
          letterSpacing: "-0.05em",
        }}
      >
        L
      </div>
    ),
    { ...size },
  );
}
