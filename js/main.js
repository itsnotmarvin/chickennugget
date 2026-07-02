// Angle Protocol entry point.

import { boot } from "./client.js";

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
