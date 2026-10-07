// Resolve the surface before CSS layout. Toolbar popups must have an intrinsic
// width; viewport-relative widths create a sizing loop in Chrome's popup host.
document.documentElement.dataset.view = new URLSearchParams(location.search).get("view") === "popup"
  ? "popup" : "settings";
