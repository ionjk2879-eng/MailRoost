// 백엔드가 계정별로 이 팔레트에서 색을 골라 문자열로 내려준다(backend/src/routes/api.ts).
// Tailwind는 소스에 리터럴로 등장하는 클래스만 빌드에 포함하므로, 런타임에만 쓰이는
// 문자열이 여기 없으면 CSS가 생성되지 않아 색이 안 보인다. 사용처는 없어도 존재만으로 충분하다.
export const GMAIL_ACCOUNT_COLOR_SAFELIST = [
  "bg-red-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-purple-500",
  "bg-amber-500",
  "bg-rose-500",
]
