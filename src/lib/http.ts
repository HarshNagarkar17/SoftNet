import { invoke } from "@tauri-apps/api/core";
import type { OutgoingRequest } from "./request";

export type HttpResult = {
  status: number;
  statusText: string;
  finalUrl: string;
  headers: { key: string; value: string }[];
  body: string;
  binary: boolean;
  truncated: boolean;
  timeMs: number;
  sizeBytes: number;
};

export function inDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

const browserRequests = new Map<string, AbortController>();

async function sendFromBrowser(request: OutgoingRequest, requestId: string): Promise<HttpResult> {
  const controller = new AbortController();
  browserRequests.set(requestId, controller);
  const started = performance.now();
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers.map((header) => [header.key, header.value] as [string, string]),
      body: request.body,
      signal: controller.signal,
    });
    const body = await response.text();
    return {
      status: response.status,
      statusText: response.statusText,
      finalUrl: response.url,
      headers: [...response.headers].map(([key, value]) => ({ key, value })),
      body,
      binary: false,
      truncated: false,
      timeMs: Math.round(performance.now() - started),
      sizeBytes: new TextEncoder().encode(body).length,
    };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Request cancelled.");
    throw new Error(`The browser blocked or failed this request. ${errorMessage(error)}`);
  } finally {
    browserRequests.delete(requestId);
  }
}

export async function sendHttp(request: OutgoingRequest, requestId: string): Promise<HttpResult> {
  if (inDesktop()) return invoke<HttpResult>("send_http", { request, requestId });
  if (import.meta.env.DEV) return sendFromBrowser(request, requestId);
  throw new Error("Send a request from the SoftNet desktop window.");
}

export async function cancelHttp(requestId: string): Promise<void> {
  if (inDesktop()) {
    await invoke("cancel_http", { requestId });
    return;
  }
  browserRequests.get(requestId)?.abort();
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The request failed.";
}

export function contentType(result: HttpResult): string {
  return (
    result.headers.find((header) => header.key.toLowerCase() === "content-type")?.value.toLowerCase() ??
    ""
  );
}
