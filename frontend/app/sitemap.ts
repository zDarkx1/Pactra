import type { MetadataRoute } from 'next';
import { appOrigin } from '../lib/workspace-config';
export const dynamic = 'force-dynamic';
export default function sitemap(): MetadataRoute.Sitemap {
  if (process.env.PACTRA_PUBLIC_INDEXING !== 'true') return [];
  try { const origin = appOrigin().origin; return [{ url: origin + '/' }]; }
  catch { return []; }
}
