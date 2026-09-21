import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://mekanix.ir/sitemap.xml",
    host: "https://mekanix.ir",
  };
}
