import { ImageResponse } from "next/og";

export const alt = "KUCCPS cluster points calculator: find the degree courses your KCSE grades can get";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#1d1d1f",
          fontFamily: "sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 600 }}>KUCCPS Cluster Points Calculator</div>
        <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, marginTop: 24, maxWidth: 1000 }}>
          Which degree courses can you get?
        </div>
        <div style={{ fontSize: 32, color: "#707070", marginTop: 28 }}>Mean grade · 20 cluster points · past KUCCPS cutoffs</div>
        <div style={{ display: "flex", marginTop: 44, background: "#0071e3", color: "#ffffff", fontSize: 28, borderRadius: 999, padding: "16px 40px" }}>
          Enter your grades
        </div>
      </div>
    ),
    size,
  );
}
