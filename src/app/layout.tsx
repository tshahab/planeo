import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cookies } from "next/headers";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Planeo — Work, clearly",
  description: "A focused project and issue tracker for modern teams.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const preference=(await cookies()).get("planeo_theme")?.value; const theme=preference==="DARK"?"dark":preference==="LIGHT"?"light":undefined;
  return (
    <html lang="en" data-theme={theme} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:`(()=>{try{const p=document.cookie.match(/(?:^|; )planeo_theme=([^;]+)/)?.[1]||'SYSTEM',d=p==='DARK'||p==='SYSTEM'&&matchMedia('(prefers-color-scheme:dark)').matches;document.documentElement.dataset.theme=d?'dark':'light'}catch{}})()`}}/></head>
      <body className={`${geist.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
