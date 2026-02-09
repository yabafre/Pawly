import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pawly.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 1,
      alternates: { languages: { fr: baseUrl, en: `${baseUrl}/en` } },
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: {
        languages: {
          fr: `${baseUrl}/pricing`,
          en: `${baseUrl}/en/pricing`,
        },
      },
    },
  ];
}
