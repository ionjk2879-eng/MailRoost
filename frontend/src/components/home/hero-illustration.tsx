export function HeroIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <circle cx="100" cy="100" r="92" className="fill-orange-100 dark:fill-orange-500/10" />
      {/* 나뭇가지 */}
      <path d="M20 150 Q100 130 180 150" className="stroke-orange-300 dark:stroke-orange-500/30" strokeWidth="4" strokeLinecap="round" />
      {/* 새집 지붕 */}
      <path d="M60 96 100 62 140 96Z" className="fill-orange-500" />
      {/* 새집 몸통 */}
      <rect x="68" y="96" width="64" height="52" rx="6" className="fill-orange-400" />
      {/* 출입구 */}
      <circle cx="100" cy="122" r="12" className="fill-orange-100 dark:fill-orange-950" />
      {/* 홰(가로대) */}
      <rect x="94" y="134" width="12" height="4" rx="2" className="fill-orange-600" />
      {/* 깃대 */}
      <line x1="100" y1="62" x2="100" y2="42" className="stroke-orange-600" strokeWidth="3" strokeLinecap="round" />
      <path d="M100 42 118 48 100 54Z" className="fill-orange-600" />
      {/* 새 */}
      <g transform="translate(140 118)">
        <ellipse cx="0" cy="0" rx="13" ry="10" className="fill-orange-600" />
        <circle cx="10" cy="-6" r="6" className="fill-orange-600" />
        <path d="M15 -7 22 -5 15 -3Z" className="fill-amber-300" />
        <circle cx="12" cy="-8" r="1.4" className="fill-white" />
      </g>
      {/* 잎사귀 */}
      <circle cx="42" cy="70" r="5" className="fill-orange-300 dark:fill-orange-500/40" />
      <circle cx="158" cy="82" r="4" className="fill-orange-300 dark:fill-orange-500/40" />
      <circle cx="168" cy="60" r="3" className="fill-orange-300 dark:fill-orange-500/40" />
    </svg>
  )
}
