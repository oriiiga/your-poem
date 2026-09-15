import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

/**
 * 汇文明朝体（Huiwen-mincho）— 全站字体
 * 免费可商用；woff2 自托管，访客设备无需安装字体即可正常显示。
 * 单字重 400，加粗由浏览器合成（synthetic bold）。
 */
const huiwen = localFont({
  src: "../fonts/Huiwen-mincho.woff2",
  weight: "400",
  style: "normal",
  display: "swap",
  variable: "--font-huiwen",
  fallback: ["Songti SC", "STSong", "SimSun", "serif"],
});

export const metadata: Metadata = {
  title: "拼贴一首诗 · 剪报诗笺",
  description:
    "从散落的字词中，拾起一首诗。点击词汇池拾取词汇，在诗笺上拼贴成句，支持拖拽排序、自录词库与一键导出诗意图片。",
  keywords: ["拼贴诗", "剪报诗笺", "网页游戏", "现代诗", "创意写作", " Collage Poems"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${huiwen.variable} font-sans`}
    >
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
