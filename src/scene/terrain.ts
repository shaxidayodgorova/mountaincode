import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MOUNTAIN_WORLD_HEIGHT } from './climate';

export interface TrailSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
}

export interface MountainWorld {
  group: THREE.Group;
  update: (time: number, windStrength: number) => void;
  dispose: () => void;
}

const TRAIL_MIN_R = 2.4;
const TRAIL_SPAN_R = 90.0;
const TRAIL_THETA_START = 0.55;
const TRAIL_THETA_SWEEP = Math.PI * 1.45;
const TRAIL_POWER = 1.15;

function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);

  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    value += amp * (valueNoise(x * freq, y * freq) * 2 - 1);
    freq *= 2.04;
    amp *= 0.5;
  }
  return value;
}

function ridgeFbm(x: number, y: number): number {
  let value = 0;
  let amp = 0.55;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq) * 2 - 1);
    value += amp * (n * n);
    freq *= 2.1;
    amp *= 0.48;
  }
  return value;
}

export function getTrailDistance(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r < TRAIL_MIN_R - 1.5 || r > TRAIL_MIN_R + TRAIL_SPAN_R + 3.5) {
    return 999;
  }
  const u = THREE.MathUtils.clamp((r - TRAIL_MIN_R) / TRAIL_SPAN_R, 0, 1);
  const p = 1 - Math.pow(u, TRAIL_POWER);
  const thetaExpected = TRAIL_THETA_START + p * TRAIL_THETA_SWEEP;
  const angDiff = Math.abs(wrapAngle(Math.atan2(z, x) - thetaExpected));
  const arcDist = r * angDiff;

  // Add slight radial distance check near endpoints
  let endExtra = 0;
  if (r > TRAIL_MIN_R + TRAIL_SPAN_R) {
    endExtra = r - (TRAIL_MIN_R + TRAIL_SPAN_R);
  } else if (r < TRAIL_MIN_R) {
    endExtra = TRAIL_MIN_R - r;
  }
  return Math.hypot(arcDist, endExtra);
}

export function getTrailPoint(progress: number, out = new THREE.Vector3()): THREE.Vector3 {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const r = TRAIL_MIN_R + TRAIL_SPAN_R * Math.pow(1 - p, 1 / TRAIL_POWER);
  const theta = TRAIL_THETA_START + p * TRAIL_THETA_SWEEP;
  const x = Math.cos(theta) * r;
  const z = Math.sin(theta) * r;
  const y = p * MOUNTAIN_WORLD_HEIGHT;
  return out.set(x, y, z);
}

export function getTrailSample(progress: number, outPos: THREE.Vector3, outTangent: THREE.Vector3): void {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  const eps = 0.002;
  const p0 = Math.max(0, p - eps);
  const p1 = Math.min(1, p + eps);
  getTrailPoint(p, outPos);
  const a = getTrailPoint(p0, new THREE.Vector3());
  const b = getTrailPoint(p1, new THREE.Vector3());
  outTangent.subVectors(b, a).normalize();
}

export function terrainHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const angle = Math.atan2(z, x);

  let baseH = 0;
  if (r <= TRAIL_MIN_R) {
    // Crisp summit crown peaking at ~101.1
    const crownT = 1 - r / TRAIL_MIN_R;
    baseH = MOUNTAIN_WORLD_HEIGHT + crownT * crownT * 1.1;
  } else if (r <= TRAIL_MIN_R + TRAIL_SPAN_R) {
    const u = (r - TRAIL_MIN_R) / TRAIL_SPAN_R;
    baseH = MOUNTAIN_WORLD_HEIGHT * (1 - Math.pow(u, TRAIL_POWER));
  } else if (r <= 145) {
    // Rolling valley meadow around base of mountain
    const vU = (r - (TRAIL_MIN_R + TRAIL_SPAN_R)) / (145 - (TRAIL_MIN_R + TRAIL_SPAN_R));
    baseH = Math.sin(vU * Math.PI) * 1.2 + fbm(x * 0.025, z * 0.025, 3) * 1.6;
  } else {
    // Distant alpine ring enclosing the horizon
    const rimU = THREE.MathUtils.clamp((r - 145) / 115, 0, 1);
    const rimRise = Math.pow(rimU, 1.35) * 44;
    const rimCrags = ridgeFbm(x * 0.018 + 4.1, z * 0.018 - 2.3) * 26 * rimU;
    baseH = rimRise + rimCrags;
  }

  // Mountain sculptural ridges & gullies away from the trail
  if (r < 140) {
    const distToTrail = getTrailDistance(x, z);
    const trailMask = THREE.MathUtils.smoothstep(distToTrail, 2.2, 6.5);
    const radialFade =
      THREE.MathUtils.smoothstep(r, 2.2, 9.0) *
      (1 - THREE.MathUtils.smoothstep(r, 90, 128));

    const spurNoise = Math.sin(angle * 5 + fbm(x * 0.03, z * 0.03, 2) * 1.8) * 3.8;
    const ridge = (ridgeFbm(x * 0.038 + 11.4, z * 0.038 - 7.2) - 0.35) * 14.5;
    const micro = fbm(x * 0.11, z * 0.11, 2) * 1.4;

    baseH += (spurNoise + ridge + micro) * trailMask * radialFade;
  }

  // Slight lake basin in the green valley away from trailhead
  const lakeDx = x - 78;
  const lakeDz = z + 72;
  const lakeDist = Math.hypot(lakeDx, lakeDz);
  if (lakeDist < 22) {
    const t = 1 - lakeDist / 22;
    baseH -= t * t * 2.4;
  }

  return baseH;
}

function createTerrainDetailTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;

  for (let i = 0; i < size * size; i++) {
    const px = i % size;
    const py = Math.floor(i / size);
    const grain = (hash2(px * 1.3, py * 1.7) - 0.5) * 24;
    const patch = (valueNoise(px * 0.08, py * 0.08) - 0.5) * 18;
    const v = THREE.MathUtils.clamp(Math.round(236 + grain + patch), 190, 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createMountainGeometry(): THREE.BufferGeometry {
  // Polar-like concentric ring grid for crisp peak + sweeping valley resolution
  const radialSegs = 136;
  const angularSegs = 160;
  const maxRadius = 260;

  const vertCount = (radialSegs + 1) * (angularSegs + 1);
  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices: number[] = [];

  const cGrassWarm = new THREE.Color('#5a983e');
  const cGrassDeep = new THREE.Color('#3b6e2c');
  const cPathWarm = new THREE.Color('#a88962');
  const cPathRock = new THREE.Color('#8a8e94');
  const cSubAlpine = new THREE.Color('#6b7f4c');
  const cGranite = new THREE.Color('#6c727d');
  const cDarkSlate = new THREE.Color('#474f5c');
  const cSnow = new THREE.Color('#eef5ff');
  const cIce = new THREE.Color('#8ec8ee');
  const cTemp = new THREE.Color();

  for (let ir = 0; ir <= radialSegs; ir++) {
    // Non-linear radial distribution: denser near mountain & trail, wider in far horizon
    const t = ir / radialSegs;
    const r = t < 0.72 ? (t / 0.72) * 115 : 115 + Math.pow((t - 0.72) / 0.28, 1.4) * (maxRadius - 115);

    for (let ia = 0; ia <= angularSegs; ia++) {
      const idx = ir * (angularSegs + 1) + ia;
      const theta = (ia / angularSegs) * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const y = terrainHeightAt(x, z);

      positions[idx * 3] = x;
      positions[idx * 3 + 1] = y;
      positions[idx * 3 + 2] = z;

      uvs[idx * 2] = x / 18;
      uvs[idx * 2 + 1] = z / 18;

      // Estimate local slope for realistic snow/rock cling
      const hDx = terrainHeightAt(x + 1.2, z) - y;
      const hDz = terrainHeightAt(x, z + 1.2) - y;
      const slope = Math.hypot(hDx, hDz) / 1.2;

      const altitudeMeters = Math.max(0, (y / MOUNTAIN_WORLD_HEIGHT) * 5000);
      const noiseVal = fbm(x * 0.06, z * 0.06, 3);
      const distTrail = getTrailDistance(x, z);
      const onTrail = 1 - THREE.MathUtils.smoothstep(distTrail, 1.1, 2.5);

      // Base zone color
      if (altitudeMeters < 1500) {
        const lush = THREE.MathUtils.clamp(0.5 + noiseVal * 0.6, 0, 1);
        cTemp.copy(cGrassDeep).lerp(cGrassWarm, lush);
        const subBlend = THREE.MathUtils.smoothstep(altitudeMeters, 1050, 1500);
        cTemp.lerp(cSubAlpine, subBlend * 0.75);
        if (onTrail > 0.01) {
          cTemp.lerp(cPathWarm, onTrail * 0.85);
        }
      } else if (altitudeMeters < 3000) {
        const rockMix = THREE.MathUtils.smoothstep(altitudeMeters, 1500, 2350);
        cTemp.copy(cSubAlpine).lerp(cGranite, rockMix);
        // Steep slopes show darker rock
        const steep = THREE.MathUtils.smoothstep(slope, 0.75, 1.35);
        cTemp.lerp(cDarkSlate, steep * 0.55);

        // First snow patches above 2000m in flatter areas
        const snowThresh = 2100 + noiseVal * 320 + slope * 420;
        const snowPatch = THREE.MathUtils.smoothstep(altitudeMeters, snowThresh, snowThresh + 480);
        cTemp.lerp(cSnow, snowPatch * 0.9);

        if (onTrail > 0.01) {
          const trailCol = altitudeMeters < 2300 ? cPathRock : cSnow.clone().lerp(cPathRock, 0.45);
          cTemp.lerp(trailCol, onTrail * 0.65);
        }
      } else {
        // Above 3000m: snow, glacial ice, and exposed dark summit crags
        const snowCov = THREE.MathUtils.smoothstep(altitudeMeters, 2750, 3450);
        const steepCliff = THREE.MathUtils.smoothstep(slope, 0.95 + noiseVal * 0.15, 1.55);
        cTemp.copy(cGranite).lerp(cSnow, snowCov);
        cTemp.lerp(cDarkSlate, steepCliff * 0.72);

        // Glacial blue ice patches above 3300m
        const icePatch =
          THREE.MathUtils.smoothstep(altitudeMeters, 3250, 4100) *
          THREE.MathUtils.smoothstep(noiseVal, -0.05, 0.32) *
          (1 - steepCliff * 0.6);
        cTemp.lerp(cIce, icePatch * 0.78);

        if (onTrail > 0.01) {
          cTemp.lerp(cSnow.clone().lerp(cIce, 0.25), onTrail * 0.55);
        }
      }

      colors[idx * 3] = cTemp.r;
      colors[idx * 3 + 1] = cTemp.g;
      colors[idx * 3 + 2] = cTemp.b;
    }
  }

  for (let ir = 0; ir < radialSegs; ir++) {
    for (let ia = 0; ia < angularSegs; ia++) {
      const a = ir * (angularSegs + 1) + ia;
      const b = a + angularSegs + 1;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, c, b);
      indices.push(c, d, b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function createPineTrees(disposables: Array<{ dispose: () => void }>): THREE.Group {
  const treeGroup = new THREE.Group();

  // Composite 3-tier conifer foliage (bottom-center pivot) + separate trunk
  const tier1 = new THREE.ConeGeometry(1.15, 2.0, 7);
  tier1.translate(0, 1.65, 0);
  const tier2 = new THREE.ConeGeometry(0.9, 1.75, 7);
  tier2.translate(0, 2.65, 0);
  const tier3 = new THREE.ConeGeometry(0.62, 1.4, 7);
  tier3.translate(0, 3.55, 0);

  const foliageGeo = mergeGeometries([tier1, tier2, tier3]);
  tier1.dispose();
  tier2.dispose();
  tier3.dispose();
  disposables.push(foliageGeo);

  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1.0, 6);
  trunkGeo.translate(0, 0.5, 0);
  disposables.push(trunkGeo);

  const foliageMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.85,
    metalness: 0.0,
    flatShading: true,
  });
  const trunkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#5a3b26'),
    roughness: 0.92,
    metalness: 0.0,
  });
  disposables.push(foliageMat, trunkMat);

  const placements: Array<{ x: number; y: number; z: number; scale: number; rot: number; tint: number }> = [];
  for (let i = 0; i < 1200 && placements.length < 430; i++) {
    const u = hash2(i * 1.73, 4.11);
    const a = hash2(i * 2.31, 9.77) * Math.PI * 2;
    const r = 46 + u * 92;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeightAt(x, z);
    const alt = (y / MOUNTAIN_WORLD_HEIGHT) * 5000;

    if (alt < -20 || alt > 1750) continue;
    if (getTrailDistance(x, z) < 4.5) continue;
    if (Math.hypot(x - 78, z + 72) < 23) continue; // Keep out of meadow pond

    const hDx = terrainHeightAt(x + 1, z) - y;
    const hDz = terrainHeightAt(x, z + 1) - y;
    if (Math.hypot(hDx, hDz) > 1.15) continue; // Avoid sheer cliffs

    placements.push({
      x,
      y: y - 0.12,
      z,
      scale: 0.72 + hash2(i, 19.3) * 0.75,
      rot: hash2(i, 31.7) * Math.PI * 2,
      tint: hash2(i, 47.1),
    });
  }

  const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, placements.length);
  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, placements.length);
  foliageInst.castShadow = true;
  foliageInst.receiveShadow = true;
  trunkInst.castShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const c1 = new THREE.Color('#255c32');
  const c2 = new THREE.Color('#3b7a3d');
  const c3 = new THREE.Color('#1f4b2f');

  placements.forEach((p, idx) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(0, p.rot, 0);
    dummy.scale.setScalar(p.scale);
    dummy.updateMatrix();
    foliageInst.setMatrixAt(idx, dummy.matrix);
    trunkInst.setMatrixAt(idx, dummy.matrix);

    if (p.tint < 0.5) {
      color.copy(c1).lerp(c2, p.tint * 2);
    } else {
      color.copy(c2).lerp(c3, (p.tint - 0.5) * 2);
    }
    foliageInst.setColorAt(idx, color);
  });

  foliageInst.instanceMatrix.needsUpdate = true;
  if (foliageInst.instanceColor) foliageInst.instanceColor.needsUpdate = true;
  trunkInst.instanceMatrix.needsUpdate = true;
  foliageInst.computeBoundingSphere();
  trunkInst.computeBoundingSphere();

  treeGroup.add(trunkInst, foliageInst);
  return treeGroup;
}

function createRocksAndIce(disposables: Array<{ dispose: () => void }>): THREE.Group {
  const group = new THREE.Group();

  // Displaced faceted boulder geometry
  const rockGeo = new THREE.DodecahedronGeometry(1.0, 1);
  const posAttr = rockGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const n = 0.78 + hash2(vx * 3.1 + vy * 2.7, vz * 4.3) * 0.42;
    posAttr.setXYZ(i, vx * n, vy * n * 0.72, vz * n);
  }
  rockGeo.computeVertexNormals();
  disposables.push(rockGeo);

  const rockMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.88,
    metalness: 0.04,
    flatShading: true,
  });
  disposables.push(rockMat);

  const rocks: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; ry: number; alt: number }> = [];
  for (let i = 0; i < 1000 && rocks.length < 250; i++) {
    const u = hash2(i * 3.1, 7.2);
    const a = hash2(i * 4.7, 13.5) * Math.PI * 2;
    const r = 6 + u * 84;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeightAt(x, z);
    const alt = (y / MOUNTAIN_WORLD_HEIGHT) * 5000;

    if (alt < 1100 || alt > 4750) continue;
    if (getTrailDistance(x, z) < 3.6) continue;

    const baseS = 0.55 + hash2(i, 88.2) * 1.35;
    rocks.push({
      x,
      y: y - baseS * 0.25,
      z,
      sx: baseS * (0.85 + hash2(i, 12.1) * 0.4),
      sy: baseS * (0.65 + hash2(i, 15.2) * 0.45),
      sz: baseS * (0.85 + hash2(i, 18.3) * 0.4),
      ry: hash2(i, 22.7) * Math.PI * 2,
      alt,
    });
  }

  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  rockInst.castShadow = true;
  rockInst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const cGranite = new THREE.Color('#6b7078');
  const cSnowRock = new THREE.Color('#b6c5d6');

  rocks.forEach((rk, i) => {
    dummy.position.set(rk.x, rk.y, rk.z);
    dummy.rotation.set(0, rk.ry, 0);
    dummy.scale.set(rk.sx, rk.sy, rk.sz);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);

    const snowMix = THREE.MathUtils.smoothstep(rk.alt, 2200, 4200);
    color.copy(cGranite).lerp(cSnowRock, snowMix * 0.65);
    rockInst.setColorAt(i, color);
  });

  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  group.add(rockInst);

  // Glacial ice seracs / crystals above 3100m
  const iceGeo = new THREE.ConeGeometry(0.65, 2.2, 5);
  iceGeo.translate(0, 1.0, 0);
  disposables.push(iceGeo);

  const iceMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffffff'),
    roughness: 0.14,
    metalness: 0.05,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    flatShading: true,
  });
  disposables.push(iceMat);

  const ices: Array<{ x: number; y: number; z: number; s: number; rx: number; ry: number; rz: number; tint: number }> = [];
  for (let i = 0; i < 650 && ices.length < 130; i++) {
    const u = hash2(i * 5.9, 2.8);
    const a = hash2(i * 6.1, 41.3) * Math.PI * 2;
    const r = 3.5 + u * 36;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeightAt(x, z);
    const alt = (y / MOUNTAIN_WORLD_HEIGHT) * 5000;

    if (alt < 3100 || alt > 4950) continue;
    if (getTrailDistance(x, z) < 3.2) continue;

    ices.push({
      x,
      y: y - 0.35,
      z,
      s: 0.55 + hash2(i, 91.4) * 1.15,
      rx: (hash2(i, 51.1) - 0.5) * 0.45,
      ry: hash2(i, 53.2) * Math.PI * 2,
      rz: (hash2(i, 55.3) - 0.5) * 0.45,
      tint: hash2(i, 57.4),
    });
  }

  const iceInst = new THREE.InstancedMesh(iceGeo, iceMat, ices.length);
  iceInst.castShadow = true;
  iceInst.receiveShadow = true;
  const cIce1 = new THREE.Color('#97d8fa');
  const cIce2 = new THREE.Color('#d2f0ff');

  ices.forEach((ic, i) => {
    dummy.position.set(ic.x, ic.y, ic.z);
    dummy.rotation.set(ic.rx, ic.ry, ic.rz);
    dummy.scale.set(ic.s, ic.s * (1.0 + ic.tint * 0.5), ic.s);
    dummy.updateMatrix();
    iceInst.setMatrixAt(i, dummy.matrix);
    color.copy(cIce1).lerp(cIce2, ic.tint);
    iceInst.setColorAt(i, color);
  });
  iceInst.instanceMatrix.needsUpdate = true;
  if (iceInst.instanceColor) iceInst.instanceColor.needsUpdate = true;
  iceInst.computeBoundingSphere();
  group.add(iceInst);

  return group;
}

function createSummitFlagAndLandmarks(disposables: Array<{ dispose: () => void }>): {
  group: THREE.Group;
  updateFlag: (time: number, windStrength: number) => void;
} {
  const group = new THREE.Group();

  // Valley pond water surface
  const pondGeo = new THREE.CircleGeometry(19, 32);
  pondGeo.rotateX(-Math.PI / 2);
  const pondMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#2c7fb8'),
    roughness: 0.12,
    metalness: 0.08,
    clearcoat: 0.9,
    transparent: true,
    opacity: 0.88,
  });
  const pond = new THREE.Mesh(pondGeo, pondMat);
  pond.position.set(78, -0.45, -72);
  pond.receiveShadow = true;
  disposables.push(pondGeo, pondMat);
  group.add(pond);

  // Wooden trailhead signpost near 0m start
  const startPos = getTrailPoint(0);
  const signGroup = new THREE.Group();
  signGroup.position.set(startPos.x + 2.8, terrainHeightAt(startPos.x + 2.8, startPos.z - 1.5), startPos.z - 1.5);

  const woodMat = new THREE.MeshStandardMaterial({ color: '#7c5334', roughness: 0.88 });
  const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 2.2, 8);
  const post = new THREE.Mesh(postGeo, woodMat);
  post.position.y = 1.05;
  post.castShadow = true;

  const boardGeo = new THREE.BoxGeometry(1.4, 0.42, 0.12);
  const board = new THREE.Mesh(boardGeo, woodMat);
  board.position.set(0.25, 1.85, 0);
  board.rotation.y = -0.35;
  board.castShadow = true;
  disposables.push(woodMat, postGeo, boardGeo);
  signGroup.add(post, board);
  group.add(signGroup);

  // Altitude stone cairns at 1000m, 2000m, 3000m, 4000m beside the path
  const cairnMat = new THREE.MeshStandardMaterial({ color: '#8f96a3', roughness: 0.85, flatShading: true });
  const cairnBaseGeo = new THREE.DodecahedronGeometry(0.45, 0);
  const cairnMidGeo = new THREE.DodecahedronGeometry(0.32, 0);
  const cairnTopGeo = new THREE.DodecahedronGeometry(0.2, 0);
  disposables.push(cairnMat, cairnBaseGeo, cairnMidGeo, cairnTopGeo);

  const pPos = new THREE.Vector3();
  const pTan = new THREE.Vector3();
  const sideVec = new THREE.Vector3();

  [0.2, 0.4, 0.6, 0.8].forEach((prog) => {
    getTrailSample(prog, pPos, pTan);
    sideVec.set(-pTan.z, 0, pTan.x).normalize();
    const cx = pPos.x + sideVec.x * 2.5;
    const cz = pPos.z + sideVec.z * 2.5;
    const cy = terrainHeightAt(cx, cz);

    const cairn = new THREE.Group();
    cairn.position.set(cx, cy, cz);

    const b = new THREE.Mesh(cairnBaseGeo, cairnMat);
    b.position.y = 0.28;
    b.scale.set(1.2, 0.75, 1.1);
    b.castShadow = true;

    const m = new THREE.Mesh(cairnMidGeo, cairnMat);
    m.position.y = 0.72;
    m.scale.set(1.1, 0.8, 1.0);
    m.castShadow = true;

    const t = new THREE.Mesh(cairnTopGeo, cairnMat);
    t.position.y = 1.05;
    t.castShadow = true;

    cairn.add(b, m, t);
    group.add(cairn);
  });

  // Summit Peak Cairn & Fluttering Flag at (0, summitY, 0)
  const summitY = terrainHeightAt(0, 0);
  const summitGroup = new THREE.Group();
  summitGroup.position.set(0, summitY, 0);

  const poleMat = new THREE.MeshStandardMaterial({
    color: '#d9e2ec',
    metalness: 0.75,
    roughness: 0.28,
  });
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.8, 12);
  const pole = new THREE.Mesh(poleGeo, poleMat);
  pole.position.y = 1.85;
  pole.castShadow = true;

  const finialGeo = new THREE.SphereGeometry(0.14, 14, 14);
  const finialMat = new THREE.MeshStandardMaterial({
    color: '#ffd426',
    metalness: 0.6,
    roughness: 0.25,
  });
  const finial = new THREE.Mesh(finialGeo, finialMat);
  finial.position.y = 3.78;

  // Subdivided pennant flag mesh for smooth wind wave
  const flagGeo = new THREE.PlaneGeometry(1.75, 0.85, 12, 4);
  flagGeo.translate(0.88, 0, 0);
  const baseFlagPositions = new Float32Array(flagGeo.attributes.position.array);
  const flagMat = new THREE.MeshStandardMaterial({
    color: '#ef4444',
    roughness: 0.65,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const flagMesh = new THREE.Mesh(flagGeo, flagMat);
  flagMesh.position.set(0.04, 3.22, 0);
  flagMesh.castShadow = true;

  disposables.push(poleMat, poleGeo, finialGeo, finialMat, flagGeo, flagMat);
  summitGroup.add(pole, finial, flagMesh);
  group.add(summitGroup);

  const updateFlag = (time: number, windStrength: number) => {
    const pos = flagGeo.attributes.position;
    const speed = 5.5 + windStrength * 9.5;
    const amp = 0.08 + windStrength * 0.24;
    for (let i = 0; i < pos.count; i++) {
      const bx = baseFlagPositions[i * 3];
      const by = baseFlagPositions[i * 3 + 1];
      const u = bx / 1.75; // 0 at pole, 1 at tip
      const wave = Math.sin(bx * 3.4 - time * speed) * amp * u;
      const flutter = Math.cos(bx * 7.0 + by * 3.0 - time * (speed * 1.4)) * 0.05 * u * windStrength;
      pos.setZ(i, wave + flutter);
      pos.setY(i, by + Math.sin(bx * 2.2 - time * (speed * 0.7)) * 0.06 * u * windStrength);
    }
    pos.needsUpdate = true;
    flagGeo.computeVertexNormals();
  };

  return { group, updateFlag };
}

export function createMountainWorld(maxAnisotropy: number): MountainWorld {
  const disposables: Array<{ dispose: () => void }> = [];
  const group = new THREE.Group();

  const terrainGeo = createMountainGeometry();
  const detailTex = createTerrainDetailTexture(maxAnisotropy);
  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detailTex,
    roughness: 0.88,
    metalness: 0.02,
  });
  disposables.push(terrainGeo, detailTex, terrainMat);

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  group.add(terrainMesh);

  const trees = createPineTrees(disposables);
  const rocksAndIce = createRocksAndIce(disposables);
  const landmarks = createSummitFlagAndLandmarks(disposables);
  group.add(trees, rocksAndIce, landmarks.group);

  const update = (time: number, windStrength: number) => {
    landmarks.updateFlag(time, windStrength);
  };

  const dispose = () => {
    for (const d of disposables) {
      d.dispose();
    }
  };

  return {
    group,
    update,
    dispose,
  };
}
