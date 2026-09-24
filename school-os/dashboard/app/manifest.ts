import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "School OS", short_name: "School OS", start_url: "/", display: "standalone", background_color: "#1a1b20", theme_color: "#1a1b20", icons: [] };
}
