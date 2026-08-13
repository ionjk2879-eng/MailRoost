const THEME_KEY = "mailroost_theme"

export type Theme = "light" | "dark" | "system"

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function getStoredTheme(): Theme {
  return (localStorage.getItem(THEME_KEY) as Theme) ?? "system"
}

export function applyTheme(theme: Theme): void {
  const resolved = theme === "system" ? getSystemTheme() : theme
  document.documentElement.classList.toggle("dark", resolved === "dark")
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
}

// 앱 시작 시 시스템 다크 모드 변경에도 반응
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)")
  const handler = () => {
    if (getStoredTheme() === "system") applyTheme("system")
  }
  mq.addEventListener("change", handler)
  return () => mq.removeEventListener("change", handler)
}
