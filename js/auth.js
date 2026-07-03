import { state } from "./state.js";

export function getIdentity() {
  return {
    kind: "guest",
    name: String(state.callsign ?? "").trim() || "Aegis",
  };
}

export async function signInWithGoogle() {
  throw new Error("not_implemented");
}
