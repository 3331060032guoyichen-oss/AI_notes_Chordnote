import type { Metadata } from "next";

import { InterfaceSoundProvider } from "../components/interface-sound";

import "./globals.css";

export const metadata: Metadata = {
  title: "Notipelago · 群岛",
  description: "Notes are not islands. 没有一条笔记应该孤立存在 —— 面向大学生的生长式 AI 知识系统。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><InterfaceSoundProvider>{children}</InterfaceSoundProvider></body>
    </html>
  );
}
