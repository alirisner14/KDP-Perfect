/**
 * three.js scene for the 3D book mockup. Loaded lazily (see screens/mockup.ts) so the rest of the app
 * stays small. All lengths are inches, matching the cover maths.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { BookDims, PoseId } from '../../core/mockup';

export interface PanelImages {
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  spine: HTMLCanvasElement;
}

export interface Look {
  glossy: boolean;
  paperColor: string;
  shadow: boolean;
  /** Both `null` = transparent. One colour = solid; two = vertical gradient (top to bottom). */
  background: { from: string | null; to?: string };
  /** Colour of the hardcover board edges / endpaper tint. */
  boardEdge: string;
}

export interface View {
  /** Degrees added to the pose's camera azimuth / elevation, and a zoom factor. */
  yaw: number;
  pitch: number;
  zoom: number;
}

interface Placement {
  pos: THREE.Vector3;
  /** Rotation about the vertical axis, radians. */
  yaw: number;
  /** Rotation about the x axis, radians (negative lays the book flat, front up). */
  tilt: number;
  lieFlat: boolean;
}

interface PoseSetup {
  placements: Placement[];
  azimuth: number;
  elevation: number;
  fov: number;
  floorY: number;
}

const rad = THREE.MathUtils.degToRad;

export class Book3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  private key = new THREE.DirectionalLight(0xffffff, 2.4);
  private fill = new THREE.HemisphereLight(0xffffff, 0xd8d4cc, 0.75);
  private floor: THREE.Mesh;
  private root = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private bgTexture: THREE.Texture | null = null;
  private env: THREE.Texture;

  private dims: BookDims | null = null;
  private images: PanelImages | null = null;
  private look: Look | null = null;
  private pose: PoseId = 'hero';
  private view: View = { yaw: 0, pitch: 0, zoom: 1 };
  private target = new THREE.Vector3();
  private baseDistance = 10;
  private cssSize = { w: 640, h: 640 };
  private raf = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.toneMapping = THREE.NoToneMapping; // keep the artwork's colours true
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap; // soft, blurred shadows
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.env;
    this.scene.environmentIntensity = 0.5;

    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 9;
    this.key.shadow.blurSamples = 20;
    this.key.shadow.bias = -0.0004;
    this.scene.add(this.key, this.key.target, this.fill, this.root);

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.22 }));
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
  }

  // ---- public API --------------------------------------------------------------------------

  /** Set everything at once. The camera view resets only when the pose changes. */
  configure(dims: BookDims, images: PanelImages, look: Look, pose: PoseId): void {
    this.dims = dims;
    this.images = images;
    this.look = look;
    if (pose !== this.pose) {
      this.pose = pose;
      this.view = { yaw: 0, pitch: 0, zoom: 1 };
    }
    this.rebuild();
  }

  setView(view: View): void {
    this.view = view;
    this.applyCamera();
    this.invalidate();
  }

  getView(): View {
    return { ...this.view };
  }

  resize(cssW: number, cssH: number): void {
    this.cssSize = { w: Math.max(1, Math.round(cssW)), h: Math.max(1, Math.round(cssH)) };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.cssSize.w, this.cssSize.h, false);
    this.camera.aspect = this.cssSize.w / this.cssSize.h;
    if (this.dims) {
      this.frame();
      this.applyCamera();
    }
    this.invalidate();
  }

  /** Render at an exact pixel size and return the encoded image. */
  async exportImage(w: number, h: number, mime: 'image/png' | 'image/jpeg', quality = 0.92): Promise<Blob> {
    const prevRatio = this.renderer.getPixelRatio();
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.frame();
    this.applyCamera();
    this.renderer.render(this.scene, this.camera);
    const blob = await new Promise<Blob>((resolve, reject) =>
      this.canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))), mime, quality),
    );
    this.renderer.setPixelRatio(prevRatio);
    this.renderer.setSize(this.cssSize.w, this.cssSize.h, false);
    this.camera.aspect = this.cssSize.w / this.cssSize.h;
    this.frame();
    this.applyCamera();
    this.invalidate();
    return blob;
  }

  maxTextureSize(): number {
    return this.renderer.capabilities.maxTextureSize;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.clearBook();
    this.bgTexture?.dispose();
    this.env.dispose();
    this.floor.geometry.dispose();
    (this.floor.material as THREE.Material).dispose();
    this.renderer.dispose();
  }

  invalidate(): void {
    if (this.disposed || this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      if (!this.disposed) this.renderer.render(this.scene, this.camera);
    });
  }

  // ---- building ----------------------------------------------------------------------------

  private clearBook(): void {
    this.root.clear();
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }

  private track<T extends { dispose(): void }>(o: T): T {
    this.disposables.push(o);
    return o;
  }

  private rebuild(): void {
    if (!this.dims || !this.images || !this.look) return;
    this.clearBook();
    const dims = this.dims;
    const look = this.look;

    const setup = this.poseSetup(dims);
    const book = this.buildBook(dims, this.images, look);
    for (const p of setup.placements) {
      const wrapper = new THREE.Group();
      wrapper.position.copy(p.pos);
      wrapper.rotation.y = p.yaw;
      const inst = book.clone(); // shares geometry and materials
      inst.rotation.x = p.tilt;
      wrapper.add(inst);
      this.root.add(wrapper);
      if (look.shadow) this.root.add(this.contactShadow(dims, p, setup.floorY));
    }
    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).userData.noShadow) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });

    this.floor.position.y = setup.floorY;
    this.floor.visible = look.shadow;
    this.camera.fov = setup.fov;
    this.floorAndLight(dims, setup);
    this.applyBackground(look.background);
    this.frame(setup);
    this.applyCamera();
    this.invalidate();
  }

  private panelTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
    const t = this.track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    t.needsUpdate = true;
    return t;
  }

  private edgeTexture(color: string, direction: 'v' | 'h'): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    // Fine page lines: thin alternating shades along the stacking direction.
    for (let i = 0; i < 256; i += 2) {
      g.fillStyle = i % 4 === 0 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.14)';
      if (direction === 'v') g.fillRect(i, 0, 1, 256);
      else g.fillRect(0, i, 256, 1);
    }
    const t = this.track(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  private buildBook(dims: BookDims, images: PanelImages, look: Look): THREE.Group {
    const { width: w, height: h, depth: d, spineSide, hardcover } = dims;
    const group = new THREE.Group();

    const cover = (canvas: HTMLCanvasElement) =>
      this.track(
        new THREE.MeshPhysicalMaterial({
          map: this.panelTexture(canvas),
          roughness: look.glossy ? 0.2 : 0.72,
          metalness: 0,
          clearcoat: look.glossy ? 1 : 0,
          clearcoatRoughness: 0.08,
          envMapIntensity: look.glossy ? 1 : 0.5,
        }),
      );
    const pages = (dir: 'v' | 'h') => this.track(new THREE.MeshStandardMaterial({ map: this.edgeTexture(look.paperColor, dir), roughness: 0.95 }));
    const plain = (color: string) => this.track(new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));

    const front = cover(images.front);
    const back = cover(images.back);
    const spine = cover(images.spine);
    const spineLeft = spineSide === -1;

    if (!hardcover) {
      const radius = Math.min(0.035, d * 0.3);
      const geo = this.track(new RoundedBoxGeometry(w, h, d, 4, radius));
      const edgeV = pages('v');
      const edgeH = pages('h');
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z
      group.add(new THREE.Mesh(geo, [spineLeft ? edgeV : spine, spineLeft ? spine : edgeV, edgeH, edgeH, front, back]));
      return group;
    }

    // Hardcover: two boards, a spine strip and a page block set back from the board edges.
    const bt = 0.085; // 2 mm case board
    const over = 0.12; // boards overhang the pages by about 3 mm
    const strip = 0.07;
    const sgn = spineLeft ? -1 : 1;
    const edge = plain(look.boardEdge);
    const endpaper = plain(look.paperColor);

    const frontBoard = new THREE.Mesh(this.track(new RoundedBoxGeometry(w, h, bt, 3, 0.022)), [edge, edge, edge, edge, front, endpaper]);
    frontBoard.position.z = d / 2 - bt / 2;
    const backBoard = new THREE.Mesh(this.track(new RoundedBoxGeometry(w, h, bt, 3, 0.022)), [edge, edge, edge, edge, endpaper, back]);
    backBoard.position.z = -d / 2 + bt / 2;

    const stripGeo = this.track(new THREE.BoxGeometry(strip, h - 0.01, d));
    const hidden = plain(look.boardEdge);
    const stripMesh = new THREE.Mesh(stripGeo, [spineLeft ? hidden : spine, spineLeft ? spine : hidden, hidden, hidden, hidden, hidden]);
    stripMesh.position.x = sgn * (w / 2 - strip / 2);

    const blockW = w - strip - over;
    const blockGeo = this.track(new THREE.BoxGeometry(blockW, h - 2 * over, d - 2 * bt - 0.004));
    const edgeV = pages('v');
    const edgeH = pages('h');
    const block = new THREE.Mesh(blockGeo, [spineLeft ? edgeV : hidden, spineLeft ? hidden : edgeV, edgeH, edgeH, hidden, hidden]);
    block.position.x = sgn * (w / 2 - strip - blockW / 2);

    group.add(backBoard, frontBoard, stripMesh, block);
    return group;
  }

  private contactShadow(dims: BookDims, p: Placement, floorY: number): THREE.Mesh {
    const size = p.lieFlat ? [dims.width * 1.25, dims.height * 1.25] : [dims.width * 1.35, Math.max(dims.depth * 3.2, dims.width * 0.35)];
    const tex = this.track(blobTexture());
    const mesh = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(size[0]!, size[1]!)),
      this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.5 })),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = p.yaw;
    mesh.position.set(p.pos.x, floorY + 0.004, p.pos.z);
    mesh.userData.noShadow = true;
    mesh.userData.contact = p;
    mesh.renderOrder = -1;
    return mesh;
  }

  // ---- poses -------------------------------------------------------------------------------

  private poseSetup(dims: BookDims): PoseSetup {
    const { width: w, height: h, depth: d } = dims;
    const ys = -dims.spineSide as 1 | -1; // +1 when the spine is on the left (turn toward it)
    const standing = (pos: THREE.Vector3, yawDeg: number, tiltDeg = 0): Placement => ({ pos, yaw: rad(yawDeg), tilt: rad(tiltDeg), lieFlat: false });
    const flat = (pos: THREE.Vector3, yawDeg: number): Placement => ({ pos, yaw: rad(yawDeg), tilt: -Math.PI / 2, lieFlat: true });
    const floorStanding = -h / 2;
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    switch (this.pose) {
      case 'front':
        return { placements: [standing(P(0, 0, 0), ys * 3)], azimuth: 0, elevation: 3, fov: 22, floorY: floorStanding };
      case 'floating':
        return { placements: [standing(P(0, 0.12 * h, 0), ys * 34, -9)], azimuth: 0, elevation: 8, fov: 30, floorY: floorStanding - 0.1 * h };
      case 'back':
        return { placements: [standing(P(0, 0, 0), 180 - ys * 32)], azimuth: 0, elevation: 6, fov: 30, floorY: floorStanding };
      case 'spine':
        return { placements: [standing(P(0, 0, 0), ys * 78)], azimuth: 0, elevation: 6, fov: 28, floorY: floorStanding };
      case 'pair':
        return {
          placements: [standing(P(-0.55 * w, 0, 0.05 * w), ys * 24), standing(P(0.5 * w, 0, -0.12 * w), -ys * 16)],
          azimuth: 0,
          elevation: 6,
          fov: 30,
          floorY: floorStanding,
        };
      case 'stack': {
        const t = Math.max(d, 0.25);
        return {
          placements: [flat(P(0, t * 0.5, 0), -4), flat(P(0.1 * w, t * 1.55, 0.02 * h), 5), flat(P(-0.06 * w, t * 2.6, -0.02 * h), -2)],
          azimuth: 0,
          elevation: 28,
          fov: 30,
          floorY: 0,
        };
      }
      case 'flat':
        return { placements: [flat(P(0, Math.max(d, 0.2) * 0.5, 0), ys * 18)], azimuth: 0, elevation: 52, fov: 30, floorY: 0 };
      case 'hero':
      default:
        return { placements: [standing(P(0, 0, 0), ys * 32)], azimuth: 0, elevation: 6, fov: 30, floorY: floorStanding };
    }
  }

  private currentSetup: PoseSetup | null = null;

  private floorAndLight(dims: BookDims, setup: PoseSetup): void {
    this.currentSetup = setup;
    const s = Math.max(dims.width, dims.height);
    this.key.position.set(-0.45 * s * 3, 1.5 * s * 3, 0.85 * s * 3);
    this.key.target.position.set(0, setup.floorY + dims.height * 0.4, 0);
    const cam = this.key.shadow.camera;
    cam.left = -s * 2;
    cam.right = s * 2;
    cam.top = s * 2;
    cam.bottom = -s * 2;
    cam.near = 0.5;
    cam.far = s * 12;
    cam.updateProjectionMatrix();
  }

  /** Fit all books into the frame (screen-space bounds), centred, with a margin. */
  private frame(setup: PoseSetup | null = this.currentSetup): void {
    if (!setup || !this.dims) return;
    const pad = 0.07;
    const { width: w, height: h, depth: d } = this.dims;
    const pts: THREE.Vector3[] = [];
    this.root.updateMatrixWorld(true);
    for (const child of this.root.children) {
      if (child.userData.contact) continue;
      const box = new THREE.Box3().setFromObject(child);
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
    }
    if (!pts.length) pts.push(new THREE.Vector3(-w / 2, -h / 2, -d / 2), new THREE.Vector3(w / 2, h / 2, d / 2));
    const center = new THREE.Box3().setFromPoints(pts).getCenter(new THREE.Vector3());

    const az = rad(setup.azimuth);
    const el = rad(setup.elevation);
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const f = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, f).normalize();
    const tanV = Math.tan(rad(setup.fov) / 2);
    const tanH = tanV * this.camera.aspect;

    let target = center.clone();
    let dist = 10;
    for (let i = 0; i < 4; i++) {
      let t = 0;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of pts) {
        const r = p.clone().sub(target);
        const px = r.dot(right);
        const py = r.dot(up);
        const pz = r.dot(f);
        t = Math.max(t, Math.abs(px) / (tanH * (1 - pad)) - pz, Math.abs(py) / (tanV * (1 - pad)) - pz);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      dist = Math.max(t, 1);
      target = target.clone().addScaledVector(right, (minX + maxX) / 2).addScaledVector(up, (minY + maxY) / 2);
    }
    this.target.copy(target);
    this.baseDistance = dist;
  }

  private applyCamera(): void {
    const setup = this.currentSetup;
    if (!setup) return;
    const az = rad(setup.azimuth + this.view.yaw);
    const el = rad(Math.max(-5, Math.min(80, setup.elevation + this.view.pitch)));
    const dist = this.baseDistance / Math.max(0.3, this.view.zoom);
    this.camera.position.set(
      this.target.x + Math.sin(az) * Math.cos(el) * dist,
      this.target.y + Math.sin(el) * dist,
      this.target.z + Math.cos(az) * Math.cos(el) * dist,
    );
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  // ---- background --------------------------------------------------------------------------

  private applyBackground(bg: Look['background']): void {
    this.bgTexture?.dispose();
    this.bgTexture = null;
    if (bg.from === null) {
      this.scene.background = null;
      return;
    }
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, bg.from);
    grad.addColorStop(1, bg.to ?? bg.from);
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.bgTexture = tex;
    this.scene.background = tex;
  }
}

/** Soft dark ellipse used as a contact shadow under each book. */
function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.9)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
