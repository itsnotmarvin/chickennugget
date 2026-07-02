import { state } from "./state.js";

export function getIdentity() {
  return {
    kind: "guest",
    name: state.callsign || "Aegis",
  };
}

export async function signInWithGoogle() {
  throw new Error("not_implemented");
}
