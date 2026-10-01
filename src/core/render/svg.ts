import type { Primitive, Scene } from '../scene';

const FONT = 'Helvetica, Arial, sans-serif';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** SVG numbers: enough precision for 1/100000 inch, no float noise. */
const n = (v: number) => String(Number(v.toFixed(5)));

function stroke(p: { stroke?: string; strokeWidth?: number; dash?: readonly [number, number] }): string {
  if (!p.stroke) return '';
  const dash = p.dash ? ` stroke-dasharray="${n(p.dash[0])} ${n(p.dash[1])}"` : '';
  return ` stroke="${p.stroke}" stroke-width="${n(p.strokeWidth ?? 0.01)}"${dash}`;
}

function primitive(p: Primitive): string {
  switch (p.kind) {
    case 'rect': {
      const fill = p.fill
        ? ` fill="${p.fill}"${p.fillOpacity !== undefined ? ` fill-opacity="${n(p.fillOpacity)}"` : ''}`
        : ' fill="none"';
      return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}"${fill}${stroke(p)}/>`;
    }
    case 'line':
      return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}"${stroke(p)}/>`;
    case 'text': {
      const anchor = p.anchor === 'middle' ? ' text-anchor="middle"' : p.anchor === 'end' ? ' text-anchor="end"' : '';
      const weight = p.bold ? ' font-weight="bold"' : '';
      const rotate = p.rotate ? ` transform="rotate(${n(p.rotate)} ${n(p.x)} ${n(p.y)})"` : '';
      return `<text x="${n(p.x)}" y="${n(p.y)}" font-size="${n(p.size)}" fill="${p.fill}"${anchor}${weight}${rotate}>${esc(p.text)}</text>`;
    }
  }
}

/**
 * Serialise a scene to a standalone SVG. The viewBox is in inches and width/height carry
 * `in` units, so design tools that honour physical size import it at the right dimensions.
 * Pass `sized: false` for on-screen previews that should scale with their container.
 */
export function sceneToSvg(scene: Scene, opts: { title?: string; sized?: boolean } = {}): string {
  const { width: w, height: h } = scene;
  const size = opts.sized === false ? '' : ` width="${n(w)}in" height="${n(h)}in"`;
  const title = opts.title ? `<title>${esc(opts.title)}</title>` : '';
  const bg = scene.background ? `<rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="${scene.background}"/>` : '';
  const body = scene.items.map(primitive).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}"${size} font-family="${FONT}">` +
    `${title}${bg}${body}</svg>`
  );
}
