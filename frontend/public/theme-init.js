(function () {
  var t = localStorage.getItem("mailroost_theme") || "system"
  if (t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches)) {
    document.documentElement.classList.add("dark")
  }
  var cs = "only light"
  document.documentElement.style.colorScheme = cs
  var meta = document.querySelector("meta[name='color-scheme']")
  if (meta) meta.content = cs
})()
