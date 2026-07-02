export const AUTH_ENABLED = false;
export const BACKEND_URL = "https://angle-protocol.itsnotmarvin.workers.dev";

export const REGION_ENDPOINTS = Object.freeze({
  auto: { id: "auto", label: "Auto (nearest)", hint: "nearest", target: "uswest" },
  uswest: { id: "uswest", label: "US West", hint: "wnam" },
  asia: { id: "asia", label: "Asia", hint: "apac" },
});

function defaultBackendUrl() {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:8787";
  }
  return BACKEND_URL;
}

export function resolveBackendUrl() {
  const override = new URLSearchParams(window.location.search).get("backend")
    || window.localStorage.getItem("angleBackendOverride");
  return override || defaultBackendUrl();
}
