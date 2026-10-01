import type { Scene } from '../scene';
import { toPixels } from '../units';
import { setJpegDpi, setPngDpi } from './raster-meta';

const FONT = 'Helvetica, Arial, sans-serif';

/** Draw a scene onto a 2D context at `scale` pixels per inch. */
export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene, scale: number): void {
  ctx.save();
  if (scene.background) {
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, scene.width * scale, scene.height * scale);
  }
  for (const p of scene.items) {
    ctx.save();
    switch (p.kind) {
      case 'rect': {
        if (p.fill) {
          ctx.globalAlpha = p.fillOpacity ?? 1;
          ctx.fillStyle = p.fill;
          ctx.fillRect(p.x * scale, p.y * scale, p.w * scale, p.h * scale);
          ctx.globalAlpha = 1;
        }
        if (p.stroke) {
          applyStroke(ctx, p.stroke, p.strokeWidth ?? 0.01, p.dash, scale);
          ctx.strokeRect(p.x * scale, p.y * scale, p.w * scale, p.h * scale);
        }
        break;
      }
      case 'line': {
        applyStroke(ctx, p.stroke, p.strokeWidth, p.dash, scale);
        ctx.beginPath();
        ctx.moveTo(p.x1 * scale, p.y1 * scale);
        ctx.lineTo(p.x2 * scale, p.y2 * scale);
        ctx.stroke();
        break;
      }
      case 'text': {
        ctx.fillStyle = p.fill;
        ctx.font = `${p.bold ? 'bold ' : ''}${p.size * scale}px ${FONT}`;
        ctx.textAlign = p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.translate(p.x * scale, p.y * scale);
        if (p.rotate) ctx.rotate((p.rotate * Math.PI) / 180);
        ctx.fillText(p.text, 0, 0);
        break;
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function applyStroke(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
  dash: readonly [number, number] | undefined,
  scale: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width * scale);
  ctx.setLineDash(dash ? [dash[0] * scale, dash[1] * scale] : []);
}

export type RasterFormat = 'png' | 'jpg';

export interface RasterResult {
  bytes: Uint8Array;
  mime: string;
  /** Pixel dimensions of the image. */
  width: number;
  height: number;
}

/** JPEG quality: flat colours and thin lines compress well, so a high setting stays small. */
const JPEG_QUALITY = 0.85;

/**
 * Render a scene to PNG or JPEG at the given DPI and tag the file with that resolution, so it opens
 * at its real physical size. Pixel size = canvas inches x DPI, rounded to whole pixels
 * (at most half a pixel, i.e. 1/600 inch at 300 DPI, off the exact size). Transparent scenes
 * can only be PNG: JPEG has no alpha channel.
 */
export async function sceneToRaster(scene: Scene, dpi: number, format: RasterFormat): Promise<RasterResult> {
  if (format === 'jpg' && scene.background === null) {
    throw new Error('JPG cannot be transparent. Use PNG or PDF for the guides overlay.');
  }
  const width = toPixels(scene.width, dpi);
  const height = toPixels(scene.height, dpi);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // An opaque canvas encodes as RGB instead of RGBA, which makes the PNG noticeably smaller.
  const ctx = canvas.getContext('2d', { alpha: scene.background === null });
  if (!ctx) throw new Error('Canvas 2D is not available in this environment.');
  drawScene(ctx, scene, dpi);

  const mime = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))), mime, JPEG_QUALITY),
  );
  const raw = new Uint8Array(await blob.arrayBuffer());
  return { bytes: format === 'png' ? setPngDpi(raw, dpi) : setJpegDpi(raw, dpi), mime, width, height };
}
