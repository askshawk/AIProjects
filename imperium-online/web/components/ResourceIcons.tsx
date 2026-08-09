// Painted resource/stat icons from the Lovable art pack (web/public/assets/ui).
// Rendered as <img> so they drop into the same call sites the old inline SVGs
// used (`<Icon />`). Sizing comes from the `.rc-icon` class + per-context CSS
// overrides (resource bar 32px, cost line 14px, etc.).

const UI = "/assets/ui";

function painted(src: string, alt: string) {
  return function Icon(props: { className?: string }) {
    return <img src={src} alt={alt} className={`rc-icon${props.className ? " " + props.className : ""}`} />;
  };
}

export const WoodIcon = painted(`${UI}/icon_wood.png`, "wood");
export const StoneIcon = painted(`${UI}/icon_stone.png`, "stone");
export const SilverIcon = painted(`${UI}/icon_silver.png`, "silver");
export const PopulationIcon = painted(`${UI}/icon_population.png`, "population");
export const AttackIcon = painted(`${UI}/icon_attack.png`, "attack");
export const DefenseIcon = painted(`${UI}/icon_defense.png`, "defense");

export const RESOURCE_ICONS = {
  wood: WoodIcon,
  stone: StoneIcon,
  silver: SilverIcon,
} as const;
