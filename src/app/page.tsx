'use client';

import dynamic from 'next/dynamic';

/**
 * 拼贴诗依赖 localStorage 与随机词池，属纯客户端游戏，
 * 关闭 SSR 以避免水合不一致。
 */
const CollagePoem = dynamic(() => import('@/components/collage-poem'), {
  ssr: false,
  loading: () => <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #3a2516 0%, #1f1410 100%)' }} />,
});

export default function Home() {
  return <CollagePoem />;
}
