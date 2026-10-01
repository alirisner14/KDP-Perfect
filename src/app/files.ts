/**
 * File output, abstracted so the same UI runs on the desktop (Electron) and in a plain browser.
 *
 *  - Desktop: asks the main process to show a native "Save as" dialog (see electron/preload.cjs).
 *  - Web:     triggers a normal browser download.
 */

export interface DesktopBridge {
  saveFile(req: { suggestedName: string; data: Uint8Array }): Promise<{ saved: boolean; path?: string }>;
  platform: string;
}

declare global {
  interface Window {
    /** Present only inside the Electron app. */
    kdpDesktop?: DesktopBridge;
  }
}

export interface SaveResult {
  saved: boolean;
  /** Full path on desktop; undefined for browser downloads. */
  path?: string;
}

export const isDesktop = (): boolean => typeof window !== 'undefined' && !!window.kdpDesktop;

async function toBytes(data: Blob | Uint8Array | string): Promise<Uint8Array> {
  if (typeof data === 'string') return new TextEncoder().encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

export async function saveFile(name: string, data: Blob | Uint8Array | string, mime: string): Promise<SaveResult> {
  const bridge = window.kdpDesktop;
  if (bridge) return bridge.saveFile({ suggestedName: name, data: await toBytes(data) });

  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { saved: true };
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API can be unavailable (permissions, insecure context); fall back to execCommand.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
