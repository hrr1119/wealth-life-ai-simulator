import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "在规则引擎裁决的独立世界里，提前模拟职业、家庭、投资、关系与风险共同塑造的人生。";
  return {
    metadataBase: new URL(origin),
    title: "财富人生｜AI 开放式人生财商模拟",
    description,
    applicationName: "财富人生",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "财富人生",
    },
    keywords: ["财商游戏", "人生模拟", "现金流", "AI游戏", "策略桌游"],
    icons: {
      icon: "/favicon.png",
      shortcut: "/favicon.png",
    },
    openGraph: {
    title: "财富人生｜先把人生，走一遍",
    description: "AI 生成受约束机会，规则引擎裁决结果的开放式人生财商沙盘。",
    type: "website",
    locale: "zh_CN",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1728,
          height: 896,
          alt: "财富人生——先把人生，走一遍。",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "财富人生｜先把人生，走一遍",
      description: "AI 生成受约束机会，规则引擎裁决结果的开放式人生财商沙盘。",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
