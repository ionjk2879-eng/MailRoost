// 파비콘(public/favicon.svg)과 동일한 디자인 — 로고를 쓰는 곳(랜딩 페이지, 사이드바)에서 공유한다.
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#EA580C" />
      <rect x="4" y="17" width="24" height="11" rx="2.2" fill="#fff" />
      <path d="M5 17.5 L16 24 L27 17.5" fill="none" stroke="#EA580C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="15.5" cy="13" rx="5.5" ry="4.5" fill="#fff" />
      <path d="M20.5 11.5 L25 13 L20.5 14.5 Z" fill="#fff" />
    </svg>
  )
}
