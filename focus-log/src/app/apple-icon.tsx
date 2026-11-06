import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/AppIcon";

// iOS uses this for "Add to Home Screen". It must be a PNG; SVG is ignored.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<AppIconArt size={size.width} />, size);
}
