// Inline SVG icons for the three unit types. Hand-drawn (no external license),
// in the same flat, outlined idiom as the resource icons: a legionary helmet,
// an archer's bow, and a scout's swift horse silhouette.

export function LegionaryIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#3d3a32" strokeWidth="1.4" strokeLinejoin="round" {...props}>
      {/* galea (helmet) with red crest */}
      <path d="M9 20 L9 15 C9 9 23 9 23 15 L23 20" fill="#c7b27a" />
      <path d="M16 6 C13 6 12 9 12 11 L20 11 C20 9 19 6 16 6 Z" fill="#b5532f" stroke="#7a3520" />
      <rect x="9" y="20" width="14" height="3" fill="#8a7d54" />
      <path d="M12 11 L12 19 M16 11 L16 19 M20 11 L20 19" stroke="#3d3a32" strokeWidth="0.9" />
      <path d="M13 23 L13 26 M19 23 L19 26" stroke="#3d3a32" />
    </svg>
  );
}

export function ArcherIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#5e3a1a" strokeWidth="1.6" strokeLinecap="round" {...props}>
      {/* bow */}
      <path d="M11 5 C19 9 19 23 11 27" fill="none" stroke="#8a5a2a" strokeWidth="2.2" />
      <path d="M11 5 L11 27" stroke="#cfd6dc" strokeWidth="1" />
      {/* arrow */}
      <path d="M9 16 L24 16" stroke="#6b6055" strokeWidth="1.4" />
      <path d="M24 16 L20 13 M24 16 L20 19" stroke="#3d3a32" strokeWidth="1.4" />
      <path d="M9 16 L12 14 M9 16 L12 18" stroke="#b5532f" strokeWidth="1.2" />
    </svg>
  );
}

export function ScoutIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#4a3826" strokeWidth="1.3" strokeLinejoin="round" {...props}>
      {/* galloping horse silhouette */}
      <path
        d="M5 22 L8 18 C8 14 11 13 14 13 L18 10 L19 7 L20 10 C23 11 25 13 25 17 L27 19 L24 19 L23 17
           C22 19 20 20 18 20 L19 24 L17 24 L16 20 L13 20 L14 24 L12 24 L11 20 C9 21 7 22 5 22 Z"
        fill="#9a6b3a"
        stroke="#4a3826"
      />
      <circle cx="20.5" cy="9" r="0.8" fill="#2b2620" stroke="none" />
    </svg>
  );
}

export const UNIT_ICONS: Record<string, (p: React.SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  legionary: LegionaryIcon,
  archer: ArcherIcon,
  scout: ScoutIcon,
};
