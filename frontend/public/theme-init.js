(function () {
  var t = localStorage.getItem("mailroost_theme") || "system"
  if (t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches)) {
    document.documentElement.classList.add("dark")
  }
  document.documentElement.style.colorScheme = t === "system" ? "light dark" : t
})()
