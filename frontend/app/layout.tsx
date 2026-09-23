import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pactra — Localization workbench',
  description: 'Inspect localization submissions with deterministic checks. Local checker starter; human review required.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
