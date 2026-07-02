import * as THREE from 'three';

type TextureKind =
  | 'grass'
  | 'infield'
  | 'track'
  | 'path'
  | 'concrete'
  | 'roof'
  | 'hill'
  | 'bark'
  | 'leaves'
  | 'brick'
  | 'slate'
  | 'terrain';

const textureCache = new Map<string, THREE.CanvasTexture>();

const palettes: Record<TextureKind, number[]> = {
  grass: [0x456f37, 0x4f7b3f, 0x5b8847, 0x3f6532],
  infield: [0x638943, 0x6d934a, 0x789f54, 0x587c3b],
  track: [0x8f5f36, 0xa46d3f, 0xb57d4a, 0x74472b],
  path: [0xb9aa8d, 0xc9bda5, 0xd7cab2, 0x9d8e75],
  concrete: [0x5f6870, 0x687079, 0x77808a, 0x505960],
  roof: [0xc8c5bb, 0xd8d6cd, 0xe4e1d6, 0xaeb0aa],
  hill: [0x5d714d, 0x637854, 0x758765, 0x4f6241],
  bark: [0x342418, 0x483626, 0x5a4430, 0x2b1d14],
  leaves: [0x2f4a2e, 0x41643a, 0x5d7446, 0x263f29],
  brick: [0x746356, 0x8d7462, 0x9a7d68, 0x5f554e],
  slate: [0x2a2826, 0x383532, 0x484542, 0x565350],
  // Near-neutral so a per-location tint color fully controls the resulting hue,
  // rather than fighting a hardcoded palette (used for grass/hill/canopy surfaces).
  terrain: [0xc4c4c0, 0xd0d0cc, 0xdadad6, 0xb8b8b4],
};

function colorToCss(hex: number) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function createNoiseTexture(kind: TextureKind, size = 128) {
  const cacheKey = `${kind}-${size}`;
  const cached = textureCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error(`Unable to create ${kind} texture`);
  }

  const palette = palettes[kind];
  ctx.fillStyle = colorToCss(palette[1]);
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < size * size * 0.42; i += 1) {
    const color = palette[Math.floor(Math.random() * palette.length)];
    const alpha = 0.16 + Math.random() * 0.22;
    const radius = kind === 'grass' || kind === 'infield' || kind === 'hill' || kind === 'leaves' || kind === 'terrain'
      ? 0.7 + Math.random() * 1.9
      : 0.45 + Math.random() * 1.35;

    ctx.fillStyle = colorToCss(color);
    ctx.globalAlpha = alpha;
    ctx.fillRect(Math.random() * size, Math.random() * size, radius, radius);
  }

  if (kind === 'grass' || kind === 'infield' || kind === 'hill' || kind === 'leaves' || kind === 'terrain') {
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 260; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const length = 3 + Math.random() * 7;
      ctx.strokeStyle = colorToCss(palette[Math.floor(Math.random() * palette.length)]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 2, y - length);
      ctx.stroke();
    }
  }

  if (kind === 'track' || kind === 'path') {
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 180; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.fillStyle = colorToCss(palette[Math.floor(Math.random() * palette.length)]);
      ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  }

  if (kind === 'bark') {
    ctx.globalAlpha = 0.22;
    for (let x = 0; x < size; x += 4) {
      ctx.strokeStyle = colorToCss(palette[Math.floor(Math.random() * palette.length)]);
      ctx.beginPath();
      ctx.moveTo(x + Math.random() * 2, 0);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, size);
      ctx.stroke();
    }
  }

  if (kind === 'brick') {
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = colorToCss(palette[3]);

    const brickW = 18;
    const brickH = 8;
    for (let y = 0; y < size + brickH; y += brickH) {
      const rowOffset = (Math.floor(y / brickH) % 2) * (brickW / 2);
      for (let x = -rowOffset; x < size + brickW; x += brickW) {
        ctx.strokeRect(x, y, brickW, brickH);
      }
    }
  }

  if (kind === 'slate') {
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = colorToCss(palette[0]);

    for (let y = 0; y < size; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y + Math.random() * 2);
      ctx.lineTo(size, y + Math.random() * 2);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;

  textureCache.set(cacheKey, texture);
  return texture;
}

export function getSurfaceTexture(kind: TextureKind, repeatX: number, repeatY: number) {
  const texture = createNoiseTexture(kind).clone();
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

export function createTexturedMaterial(
  kind: TextureKind,
  color: number,
  repeatX: number,
  repeatY: number,
  options: Omit<THREE.MeshStandardMaterialParameters, 'color' | 'map'> = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    map: getSurfaceTexture(kind, repeatX, repeatY),
    ...options,
  });
}
