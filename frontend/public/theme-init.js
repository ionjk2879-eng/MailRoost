(function () {
  var t = localStorage.getItem("mailroost_theme") || "system"
  var isDark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches)
  if (isDark) {
    document.documentElement.classList.add("dark")
  }
  document.documentElement.style.colorScheme = isDark ? "dark" : "only light"
})()
