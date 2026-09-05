import type { Metadata } from 'next';
import { Barlow_Condensed, Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
const display = Barlow_Condensed({
  weight: ['500', '600', '700'],
  variable: '--font-display',
  subsets: ['latin'],
});
const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
export const metadata: Metadata = {
  title: 'Crescent Rose · Interactive Weapon Study',
  description:
    'Explore a Three.js reconstruction of Ruby Rose’s Crescent Rose from RWBY. Orbit, inspect the details, and export the 3D model.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        {children}
      </body>
    </html>
  );
}
