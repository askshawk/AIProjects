/** Shared artwork for the generated favicon and home-screen icon. */
export function AppIconArt({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #5b4bdb, #8b80f9)",
        color: "white",
        fontSize: size * 0.42,
        fontWeight: 700,
        letterSpacing: -size * 0.02,
        fontFamily: "sans-serif",
      }}
    >
      AI
    </div>
  );
}
