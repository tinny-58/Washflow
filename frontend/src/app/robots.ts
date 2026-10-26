import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://washflow.co.ke";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/prices", "/about", "/faq", "/contact", "/terms", "/privacy"],
      disallow: [
        "/admin/",
        "/client/",
        "/dashboard/",
        "/scan/",
        "/track/",
        "/rate/",
        "/api/",
        "/_next/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
