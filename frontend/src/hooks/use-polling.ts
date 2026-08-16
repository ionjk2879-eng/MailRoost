import { useEffect, useRef } from "react"

// 탭이 보일 때만 일정 간격으로 콜백을 반복 실행한다. App.tsx의 20초/60초 폴링 useEffect 두 개가
// document.hidden 체크 + setInterval + visibilitychange 리스너 패턴을 그대로 복제하고 있던 것을
// 하나로 합친 것 — 로직은 원본과 동일하다.
//
// 콜백은 매 렌더링마다 최신 버전을 ref에 담아두고 그걸 호출한다. 그래서 interval 자체는
// (enabled, intervalMs)가 바뀌지 않는 한 다시 만들어지지 않으면서도, 항상 최신 콜백을 호출한다.
export function usePolling(callback: () => void, intervalMs: number, enabled: boolean) {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!enabled) return
    const poll = () => {
      if (!document.hidden) callbackRef.current()
    }
    const interval = setInterval(poll, intervalMs)
    document.addEventListener("visibilitychange", poll)
    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [enabled, intervalMs])
}
