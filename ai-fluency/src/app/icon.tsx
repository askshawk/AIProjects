import { ImageResponse } from "next/og";
import { AppIconArt } from "@/components/AppIcon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<AppIconArt size={size.width} />, size);
}
