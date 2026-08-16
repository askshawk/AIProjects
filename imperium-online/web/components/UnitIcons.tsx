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

export function SettlerIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#5e3a1a" strokeWidth="1.4" strokeLinejoin="round" {...props}>
      {/* a covered colonist's wagon */}
      <path d="M6 22 C6 14 26 14 26 22 Z" fill="#e8dcc0" stroke="#8a6a3a" />
      <path d="M6 22 L26 22 L24 25 L8 25 Z" fill="#9a6a3a" />
      <path d="M11 15 L11 22 M16 14 L16 22 M21 15 L21 22" stroke="#caa06a" strokeWidth="0.9" />
      <circle cx="10" cy="26" r="2.6" fill="#4a3018" />
      <circle cx="22" cy="26" r="2.6" fill="#4a3018" />
      {/* founding pennant */}
      <path d="M16 14 L16 6" stroke="#5e3a1a" strokeWidth="1.4" />
      <path d="M16 7 L23 9 L16 11 Z" fill="#b5532f" stroke="#7d3320" />
    </svg>
  );
}

// --- the fleet. Same flat, outlined idiom: a ram and striped sail for the
// trireme, a shielded gunwale for the defensive bireme, and a tubby
// merchantman riding low under cargo for the transport.

export function TriremeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#3d3a32" strokeWidth="1.3" strokeLinejoin="round" {...props}>
      {/* mast + red-striped square sail */}
      <path d="M16 4 L16 18" stroke="#6b4a24" strokeWidth="1.4" />
      <path d="M8 6 L24 6 L24 14 L8 14 Z" fill="#e8dcc0" />
      <path d="M8 9 L24 9 M8 11.5 L24 11.5" stroke="#b5532f" strokeWidth="1.2" />
      {/* lean hull with a bronze ram at the bow */}
      <path d="M5 19 L27 19 L23 25 L9 25 Z" fill="#8a6a3a" />
      <path d="M27 19 L31 21 L27 22 Z" fill="#c79a3a" stroke="#8a6a1f" />
      {/* oars */}
      <path d="M11 25 L10 28 M15 25 L14 28 M19 25 L18 28" stroke="#6b4a24" strokeWidth="1" />
    </svg>
  );
}

export function BiremeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#3d3a32" strokeWidth="1.3" strokeLinejoin="round" {...props}>
      {/* mast + blue sail */}
      <path d="M16 4 L16 16" stroke="#6b4a24" strokeWidth="1.4" />
      <path d="M9 6 L23 6 L23 13 L9 13 Z" fill="#bcd3e4" />
      <path d="M9 9.5 L23 9.5" stroke="#3f7fa6" strokeWidth="1.2" />
      {/* stocky hull */}
      <path d="M4 18 L28 18 L24 26 L8 26 Z" fill="#7d6236" />
      {/* a row of round shields along the gunwale — the sea wall */}
      <circle cx="9" cy="21" r="2" fill="#b5532f" strokeWidth="0.9" />
      <circle cx="16" cy="21" r="2" fill="#c79a3a" strokeWidth="0.9" />
      <circle cx="23" cy="21" r="2" fill="#b5532f" strokeWidth="0.9" />
    </svg>
  );
}

export function TransportIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#3d3a32" strokeWidth="1.3" strokeLinejoin="round" {...props}>
      {/* furled sail on a short mast — she runs heavy, not fast */}
      <path d="M16 5 L16 15" stroke="#6b4a24" strokeWidth="1.4" />
      <path d="M11 7 C14 5.5 18 5.5 21 7 L21 9 C18 7.5 14 7.5 11 9 Z" fill="#e0d5b8" />
      {/* deck cargo: crates and an amphora */}
      <rect x="9" y="12" width="6" height="5" fill="#a8813f" />
      <rect x="16" y="13" width="5" height="4" fill="#8a6a3a" />
      <path d="M22 12 C24 12 24 16 22 17 Z" fill="#b5532f" />
      {/* wide-beamed hull riding low */}
      <path d="M3 18 L29 18 L25 26 L7 26 Z" fill="#8a6a3a" />
      <path d="M3 20.5 L29 20.5" stroke="#5e4525" strokeWidth="1" />
    </svg>
  );
}

export const UNIT_ICONS: Record<string, (p: React.SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  legionary: LegionaryIcon,
  archer: ArcherIcon,
  scout: ScoutIcon,
  settler: SettlerIcon,
  trireme: TriremeIcon,
  bireme: BiremeIcon,
  transport: TransportIcon,
};
