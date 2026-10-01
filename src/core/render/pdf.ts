import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib';
import type { Scene } from '../scene';
import { PT_PER_INCH } from '../units';

function color(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Unsupported colour: ${hex}`);
  return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255);
}

/** The built-in PDF fonts only cover WinAnsi; replace anything else rather than crash. */
function printable(font: PDFFont, text: string): string {
  const supported = new Set(font.getCharacterSet());
  return [...text].map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : '?')).join('');
}

/**
 * Render a scene to a single-page vector PDF whose page size equals the cover canvas exactly
 * (inches x 72 = points). Print it at 100% to check measurements with a ruler.
 */
export async function sceneToPdf(scene: Scene, meta: { title?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  if (meta.title) doc.setTitle(meta.title);
  doc.setProducer('KDP Perfect');
  doc.setCreator('KDP Perfect');

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const wPt = scene.width * PT_PER_INCH;
  const hPt = scene.height * PT_PER_INCH;
  const page = doc.addPage([wPt, hPt]);
  const X = (x: number) => x * PT_PER_INCH;
  const Y = (y: number) => hPt - y * PT_PER_INCH;

  if (scene.background) page.drawRectangle({ x: 0, y: 0, width: wPt, height: hPt, color: color(scene.background) });

  for (const p of scene.items) {
    switch (p.kind) {
      case 'rect': {
        page.drawRectangle({
          x: X(p.x),
          y: Y(p.y + p.h),
          width: X(p.w),
          height: X(p.h),
          ...(p.fill ? { color: color(p.fill), opacity: p.fillOpacity ?? 1 } : {}),
          ...(p.stroke
            ? {
                borderColor: color(p.stroke),
                borderWidth: X(p.strokeWidth ?? 0.01),
                ...(p.dash ? { borderDashArray: [X(p.dash[0]), X(p.dash[1])] } : {}),
              }
            : {}),
        });
        break;
      }
      case 'line': {
        page.drawLine({
          start: { x: X(p.x1), y: Y(p.y1) },
          end: { x: X(p.x2), y: Y(p.y2) },
          thickness: X(p.strokeWidth),
          color: color(p.stroke),
          ...(p.dash ? { dashArray: [X(p.dash[0]), X(p.dash[1])] } : {}),
        });
        break;
      }
      case 'text': {
        const font = p.bold ? bold : regular;
        const text = printable(font, p.text);
        const size = X(p.size);
        const width = font.widthOfTextAtSize(text, size);
        const shift = p.anchor === 'middle' ? -width / 2 : p.anchor === 'end' ? -width : 0;
        const rot = ((p.rotate ?? 0) * Math.PI) / 180;
        // Scene rotation is clockwise on screen; PDF space is y-up, so the direction vector flips sign.
        page.drawText(text, {
          x: X(p.x) + shift * Math.cos(rot),
          y: Y(p.y) - shift * Math.sin(rot),
          size,
          font,
          color: color(p.fill),
          ...(p.rotate ? { rotate: degrees(-p.rotate) } : {}),
        });
        break;
      }
    }
  }
  return doc.save();
}
