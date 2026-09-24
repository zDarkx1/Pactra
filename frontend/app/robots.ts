import type { MetadataRoute } from 'next';
import { appOrigin } from '../lib/workspace-config';
export const dynamic = 'force-dynamic';
export default function robots(): MetadataRoute.Robots {
  if (process.env.PACTRA_PUBLIC_INDEXING !== 'true') return { rules: { userAgent: '*', disallow: '/' } };
  try { return { rules: { userAgent: '*', allow: ['/', '/checker'], disallow: ['/tasks', '/dashboard', '/api/'] }, sitemap: appOrigin().origin + '/sitemap.xml' }; }
  catch { return { rules: { userAgent: '*', disallow: '/' } }; }
}
