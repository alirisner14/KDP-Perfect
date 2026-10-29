/** Small DOM helpers shared by the screens. */

export const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** UI typography: show a multiplication sign instead of the ASCII x used in exports. */
export const times = (s: string) => s.replace(/ x /g, ' × ');

let toastTimer: number | undefined;

export function toast(message: string): void {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), 4500);
}

export interface Segment {
  /** Re-read the current value and update `aria-pressed`. */
  sync(): void;
  /** Disable individual options. */
  disable(value: string, disabled: boolean, title?: string): void;
}

/** A segmented button group bound to a getter/setter. */
export function segment<T extends string>(
  host: HTMLElement,
  items: { value: T; label: string }[],
  get: () => T,
  set: (v: T) => void,
): Segment {
  host.innerHTML = items.map((i) => `<button type="button" data-v="${esc(i.value)}">${esc(i.label)}</button>`).join('');
  host.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button');
    if (b && !b.disabled) set(b.dataset.v as T);
  });
  return {
    sync: () => host.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === get()))),
    disable: (value, disabled, title = '') => {
      const b = host.querySelector<HTMLButtonElement>(`[data-v="${CSS.escape(value)}"]`);
      if (b) {
        b.disabled = disabled;
        b.title = disabled ? title : '';
      }
    },
  };
}

/** Wire a file input and a drop target to one handler. */
export function bindFileInput(input: HTMLInputElement, dropTarget: HTMLElement | null, onFile: (file: File) => void): void {
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.value = ''; // allow choosing the same file again
  });
  if (!dropTarget) return;
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  for (const type of ['dragenter', 'dragover']) {
    dropTarget.addEventListener(type, (e) => {
      stop(e);
      dropTarget.classList.add('over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropTarget.addEventListener(type, (e) => {
      stop(e);
      dropTarget.classList.remove('over');
    });
  }
  dropTarget.addEventListener('drop', (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) onFile(f);
  });
}

/** Trigger `fn` at most once per animation frame. */
export function rafThrottle(fn: () => void): () => void {
  let pending = 0;
  return () => {
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      fn();
    });
  };
}
