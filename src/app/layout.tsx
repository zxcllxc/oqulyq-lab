import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, PT_Serif } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({ variable: "--font-plex", subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["400", "500"] });
const serif = PT_Serif({ variable: "--font-serif", subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["700"] });

export const metadata: Metadata = {
  title: "Oqulyq Lab — Data-Driven Curriculum",
  description: "Аналитика для методистов: трудные темы, честное сравнение учебников, перераспределение часов.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className={`${plex.variable} ${plexMono.variable} ${serif.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
