import { CATEGORY_INFO, type Category } from "@/lib/categories";

/** Colour swatch + name, so identity never rides on colour alone. */
export function CategoryTag({ category }: { category: Category }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_INFO[category].color }} aria-hidden />
      {CATEGORY_INFO[category].label}
    </span>
  );
}
