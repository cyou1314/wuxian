import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Xan",
  description: "LibTV 形态 × Dola 生成引擎 × 多账号额度控制",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
