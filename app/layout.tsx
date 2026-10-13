import type { Metadata } from "next";

import { InterfaceSoundProvider } from "../components/interface-sound";

import "./globals.css";

export const metadata: Metadata = {
  title: "Chordnote · 和弦",
  description: "Notes become chords. 一条笔记是音符，连起来才是和弦 —— 面向大学生的生长式 AI 知识系统。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><InterfaceSoundProvider>{children}</InterfaceSoundProvider></body>
    </html>
  );
}
