import { inDesktop } from "./http";

export async function setWindowTitle(title: string) {
  document.title = title;
  if (!inDesktop()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

export async function closeWindow() {
  if (!inDesktop()) {
    window.close();
    return;
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().destroy();
}
