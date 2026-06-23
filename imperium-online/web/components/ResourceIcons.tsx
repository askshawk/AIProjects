// Inline SVG resource icons. Hand-drawn (so no external license attribution
// needed) — simple stacked-logs / stone-brick / silver-ingot silhouettes in the
// game-icons.net visual idiom. Colored via CSS variables so they fit the theme.

export function WoodIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" {...props}>
      <ellipse cx="9" cy="11" rx="4.5" ry="2.5" fill="#a06a3a" stroke="#5e3a1a" />
      <ellipse cx="23" cy="11" rx="4.5" ry="2.5" fill="#a06a3a" stroke="#5e3a1a" />
      <ellipse cx="16" cy="20" rx="4.5" ry="2.5" fill="#b87a45" stroke="#5e3a1a" />
      <circle cx="9" cy="11" r="1.4" fill="#e8c590" stroke="#5e3a1a" />
      <circle cx="23" cy="11" r="1.4" fill="#e8c590" stroke="#5e3a1a" />
      <circle cx="16" cy="20" r="1.4" fill="#e8c590" stroke="#5e3a1a" />
    </svg>
  );
}

export function StoneIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#3d3a32" strokeWidth="1.4" strokeLinejoin="round" {...props}>
      <path d="M6 22 L10 14 L22 14 L26 22 Z" fill="#9a958a" />
      <path d="M6 22 L26 22 L24 26 L8 26 Z" fill="#7b766c" />
      <path d="M10 14 L13 18 L19 18 L22 14" stroke="#3d3a32" strokeWidth="0.9" fill="none" />
      <path d="M13 18 L11 22 M19 18 L21 22 M16 18 L16 22" stroke="#3d3a32" strokeWidth="0.9" />
    </svg>
  );
}

export function SilverIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="#4a5663" strokeWidth="1.4" strokeLinejoin="round" {...props}>
      <path d="M5 14 L9 10 L23 10 L27 14 L23 18 L9 18 Z" fill="#c7d0d8" />
      <path d="M5 14 L9 18 L23 18 L27 14" stroke="#4a5663" />
      <path d="M9 10 L9 18 M23 10 L23 18" stroke="#4a5663" strokeWidth="0.9" />
      <path d="M12 13 L14 11 M18 13 L20 11" stroke="#fff" strokeWidth="0.7" opacity="0.7" />
    </svg>
  );
}

export const RESOURCE_ICONS = {
  wood: WoodIcon,
  stone: StoneIcon,
  silver: SilverIcon,
} as const;
