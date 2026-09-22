(function () {
  var t = localStorage.getItem("mailroost_theme") || "system"
  if (t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches)) {
    document.documentElement.classList.add("dark")
  }
  var cs = t === "system" ? "light dark" : t === "light" ? "only light" : "dark"
  document.documentElement.style.colorScheme = cs
  var meta = document.createElement("meta")
  meta.name = "color-scheme"
  meta.content = cs
  document.head.appendChild(meta)
})()
