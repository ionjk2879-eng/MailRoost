// 일부 브라우저 확장 프로그램/보안 소프트웨어가 Cookie 헤더에 쉼표로 구분된 값을
// 끼워넣는 경우가 있어, 표준 "; " 구분자를 가정하는 파서로는 값을 못 찾을 수 있다.
// 세미콜론과 쉼표 구분자를 모두 허용해 이름으로 직접 값을 찾는다.
export function readRawCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined
  const match = cookieHeader.match(new RegExp(`(?:^|[;,]\\s*)${name}=([^;,]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

export function isHttps(url: string): boolean {
  return new URL(url).protocol === "https:"
}
