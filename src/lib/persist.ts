import { invoke } from "@tauri-apps/api/core";
import { inDesktop } from "./http";

export async function loadStore(name: string): Promise<string | null> {
  if (inDesktop()) return invoke<string | null>("load_store", { name });
  return localStorage.getItem(`softnet.store.${name}`);
}

export async function saveStore(name: string, contents: string): Promise<void> {
  if (inDesktop()) {
    await invoke("save_store", { name, contents });
    return;
  }
  localStorage.setItem(`softnet.store.${name}`, contents);
}
