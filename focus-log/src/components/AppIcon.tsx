/** Shared artwork for the generated favicon and home-screen icon: a timer ring. */
export function AppIconArt({ size }: { size: number }) {
  const ring = size * 0.56;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0e0e13",
      }}
    >
      <div
        style={{
          width: ring,
          height: ring,
          borderRadius: "50%",
          border: `${size * 0.07}px solid #8b80f9`,
          borderTopColor: "#eda100",
          display: "flex",
        }}
      />
    </div>
  );
}
