import * as THREE from 'three';

export interface WeatherSystem {
  group: THREE.Group;
  update: (
    delta: number,
    time: number,
    duckPos: THREE.Vector3,
    beakWorldPos: THREE.Vector3,
    duckForward: THREE.Vector3,
    windStrength: number,
    snowIntensity: number,
    breathIntensity: number,
  ) => number; // returns breathPulse 0..1
  dispose: () => void;
}

function createSoftParticleTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 1, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.45, 'rgba(240, 248, 255, 0.72)');
  grad.addColorStop(1, 'rgba(220, 238, 255, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface CloudInstance {
  group: THREE.Group;
  radius: number;
  angle: number;
  baseY: number;
  speed: number;
  bobPhase: number;
}

export function createWeatherSystem(): WeatherSystem {
  const disposables: Array<{ dispose: () => void }> = [];
  const group = new THREE.Group();

  const spriteTex = createSoftParticleTexture();
  disposables.push(spriteTex);

  // 1. 3D Fluffy Alpine Clouds around mid-to-upper slopes (y = 40..84)
  const cloudPuffGeo = new THREE.SphereGeometry(1, 16, 12);
  const cloudMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f4f8ff'),
    roughness: 0.95,
    metalness: 0.0,
    transparent: true,
    opacity: 0.86,
  });
  disposables.push(cloudPuffGeo, cloudMat);

  const clouds: CloudInstance[] = [];
  const cloudCount = 24;
  for (let i = 0; i < cloudCount; i++) {
    const cGroup = new THREE.Group();
    const puffCount = 4 + (i % 3);
    for (let p = 0; p < puffCount; p++) {
      const puff = new THREE.Mesh(cloudPuffGeo, cloudMat);
      const px = (p - (puffCount - 1) * 0.5) * 2.5;
      const py = (p === 1 || p === 2 ? 0.65 : 0.0) + ((i + p) % 2) * 0.25;
      const pz = ((p % 2) - 0.5) * 1.4;
      const s = 2.2 + ((i * 7 + p * 3) % 5) * 0.42;
      puff.position.set(px, py, pz);
      puff.scale.set(s * 1.35, s * 0.72, s * 1.05);
      cGroup.add(puff);
    }

    const baseY = 40 + (i / cloudCount) * 44; // 2000m .. 4200m
    const mountainRAtY = 2.4 + 90 * Math.pow(Math.max(0.05, 1 - baseY / 100), 1 / 1.15);
    const radius = mountainRAtY + 14 + (i % 4) * 11;
    const angle = (i / cloudCount) * Math.PI * 2 + (i % 3) * 0.4;

    cGroup.position.set(Math.cos(angle) * radius, baseY, Math.sin(angle) * radius);
    cGroup.rotation.y = -angle;
    group.add(cGroup);

    clouds.push({
      group: cGroup,
      radius,
      angle,
      baseY,
      speed: 0.014 + (i % 5) * 0.004,
      bobPhase: i * 1.3,
    });
  }

  // 2. Swirling Snow & Wind Particles centered around the duck
  const SNOW_COUNT = 900;
  const SNOW_HALF_XZ = 26;
  const SNOW_HALF_Y = 16;
  const snowPositions = new Float32Array(SNOW_COUNT * 3);
  const snowOffsets = new Float32Array(SNOW_COUNT * 3); // local offset relative to duck
  const snowSeeds = new Float32Array(SNOW_COUNT);

  for (let i = 0; i < SNOW_COUNT; i++) {
    snowOffsets[i * 3] = (Math.random() - 0.5) * SNOW_HALF_XZ * 2;
    snowOffsets[i * 3 + 1] = (Math.random() - 0.5) * SNOW_HALF_Y * 2;
    snowOffsets[i * 3 + 2] = (Math.random() - 0.5) * SNOW_HALF_XZ * 2;
    snowSeeds[i] = Math.random() * Math.PI * 2;
  }

  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
  const snowMat = new THREE.PointsMaterial({
    map: spriteTex,
    color: new THREE.Color('#eef7ff'),
    size: 0.48,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const snowPoints = new THREE.Points(snowGeo, snowMat);
  snowPoints.frustumCulled = false;
  disposables.push(snowGeo, snowMat);
  group.add(snowPoints);

  // 3. Duck Cold Breath Vapor Emitter (pooled particles)
  const BREATH_COUNT = 44;
  const breathPositions = new Float32Array(BREATH_COUNT * 3);
  const breathVelocities = new Float32Array(BREATH_COUNT * 3);
  const breathAges = new Float32Array(BREATH_COUNT);
  const breathMaxAge = new Float32Array(BREATH_COUNT);
  const breathColors = new Float32Array(BREATH_COUNT * 3);

  for (let i = 0; i < BREATH_COUNT; i++) {
    breathAges[i] = 99; // inactive
    breathMaxAge[i] = 1.2;
    breathPositions[i * 3 + 1] = -999;
  }

  const breathGeo = new THREE.BufferGeometry();
  breathGeo.setAttribute('position', new THREE.BufferAttribute(breathPositions, 3));
  breathGeo.setAttribute('color', new THREE.BufferAttribute(breathColors, 3));

  const breathMat = new THREE.PointsMaterial({
    map: spriteTex,
    size: 0.44,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.65,
    vertexColors: true,
    depthWrite: false,
  });
  const breathPoints = new THREE.Points(breathGeo, breathMat);
  breathPoints.frustumCulled = false;
  disposables.push(breathGeo, breathMat);
  group.add(breathPoints);

  let breathNextIdx = 0;
  let breathSpawnAccum = 0;

  // Reusable wind vector
  const windDir = new THREE.Vector3(1, 0.08, 0.35).normalize();

  const update = (
    delta: number,
    time: number,
    duckPos: THREE.Vector3,
    beakWorldPos: THREE.Vector3,
    duckForward: THREE.Vector3,
    windStrength: number,
    snowIntensity: number,
    breathIntensity: number,
  ): number => {
    const dt = Math.min(delta, 0.05);

    // Drift clouds gently, faster in high wind
    const cloudSpeedMult = 1 + windStrength * 1.8;
    for (let i = 0; i < clouds.length; i++) {
      const c = clouds[i];
      c.angle += dt * c.speed * cloudSpeedMult;
      c.group.position.set(
        Math.cos(c.angle) * c.radius,
        c.baseY + Math.sin(time * 0.4 + c.bobPhase) * 0.45,
        Math.sin(c.angle) * c.radius,
      );
      c.group.rotation.y = -c.angle;
    }

    // Update Snow & Wind Streaks
    snowMat.opacity = snowIntensity * 0.85;
    snowMat.size = 0.38 + windStrength * 0.18;
    snowPoints.visible = snowIntensity > 0.01;

    if (snowPoints.visible) {
      const fallSpeed = 2.6 + windStrength * 4.5;
      const windPushX = (3.5 + windStrength * 22.0) * (0.8 + Math.sin(time * 1.7) * 0.25);
      const windPushZ = (1.2 + windStrength * 7.5) * (0.8 + Math.cos(time * 1.3) * 0.25);
      const posAttr = snowGeo.attributes.position as THREE.BufferAttribute;

      for (let i = 0; i < SNOW_COUNT; i++) {
        const idx = i * 3;
        const seed = snowSeeds[i];

        let ox = snowOffsets[idx];
        let oy = snowOffsets[idx + 1];
        let oz = snowOffsets[idx + 2];

        ox += (windPushX + Math.sin(time * 2.2 + seed) * 1.2) * dt;
        oy -= (fallSpeed + Math.cos(time * 1.9 + seed) * 0.4) * dt;
        oz += (windPushZ + Math.cos(time * 2.0 + seed) * 1.0) * dt;

        // Wrap within local box around duck
        if (ox > SNOW_HALF_XZ) ox -= SNOW_HALF_XZ * 2;
        if (ox < -SNOW_HALF_XZ) ox += SNOW_HALF_XZ * 2;
        if (oy < -SNOW_HALF_Y) oy += SNOW_HALF_Y * 2;
        if (oy > SNOW_HALF_Y) oy -= SNOW_HALF_Y * 2;
        if (oz > SNOW_HALF_XZ) oz -= SNOW_HALF_XZ * 2;
        if (oz < -SNOW_HALF_XZ) oz += SNOW_HALF_XZ * 2;

        snowOffsets[idx] = ox;
        snowOffsets[idx + 1] = oy;
        snowOffsets[idx + 2] = oz;

        posAttr.setXYZ(i, duckPos.x + ox, duckPos.y + oy + 2.5, duckPos.z + oz);
      }
      posAttr.needsUpdate = true;
    }

    // Rhythmic Cold Breath Cycle (~every 1.9 seconds, exhale burst lasts ~0.65s)
    const cycle = (time * 0.54) % 1.0;
    const isExhaling = breathIntensity > 0.04 && cycle < 0.36;
    const breathPulse = isExhaling
      ? Math.sin((cycle / 0.36) * Math.PI) * breathIntensity
      : 0;

    if (isExhaling) {
      breathSpawnAccum += dt * (22 + breathIntensity * 26);
      while (breathSpawnAccum >= 1) {
        breathSpawnAccum -= 1;
        const idx = breathNextIdx;
        breathNextIdx = (breathNextIdx + 1) % BREATH_COUNT;

        breathAges[idx] = 0;
        breathMaxAge[idx] = 0.75 + Math.random() * 0.55;

        const jx = (Math.random() - 0.5) * 0.08;
        const jy = (Math.random() - 0.5) * 0.06;
        const jz = (Math.random() - 0.5) * 0.08;
        breathPositions[idx * 3] = beakWorldPos.x + jx;
        breathPositions[idx * 3 + 1] = beakWorldPos.y + jy;
        breathPositions[idx * 3 + 2] = beakWorldPos.z + jz;

        const puffSpeed = 1.15 + Math.random() * 0.55;
        breathVelocities[idx * 3] =
          duckForward.x * puffSpeed + windDir.x * windStrength * 2.2 + (Math.random() - 0.5) * 0.35;
        breathVelocities[idx * 3 + 1] = 0.45 + Math.random() * 0.35;
        breathVelocities[idx * 3 + 2] =
          duckForward.z * puffSpeed + windDir.z * windStrength * 2.2 + (Math.random() - 0.5) * 0.35;
      }
    } else {
      breathSpawnAccum = 0;
    }

    const bPosAttr = breathGeo.attributes.position as THREE.BufferAttribute;
    const bColAttr = breathGeo.attributes.color as THREE.BufferAttribute;
    let anyActiveBreath = false;

    for (let i = 0; i < BREATH_COUNT; i++) {
      const age = breathAges[i];
      const maxAge = breathMaxAge[i];
      if (age < maxAge) {
        anyActiveBreath = true;
        breathAges[i] = age + dt;
        const life = THREE.MathUtils.clamp(age / maxAge, 0, 1);
        const idx = i * 3;

        // Air drag + gentle upward drift + wind push
        breathVelocities[idx] *= 1 - dt * 1.8;
        breathVelocities[idx + 1] += dt * 0.35;
        breathVelocities[idx + 2] *= 1 - dt * 1.8;

        breathPositions[idx] += (breathVelocities[idx] + windDir.x * windStrength * 1.6) * dt;
        breathPositions[idx + 1] += breathVelocities[idx + 1] * dt;
        breathPositions[idx + 2] += (breathVelocities[idx + 2] + windDir.z * windStrength * 1.6) * dt;

        const fade = (1 - life) * (0.45 + breathIntensity * 0.55);
        bPosAttr.setXYZ(i, breathPositions[idx], breathPositions[idx + 1], breathPositions[idx + 2]);
        bColAttr.setXYZ(i, 0.88 * fade, 0.95 * fade, 1.0 * fade);
      } else {
        bPosAttr.setXYZ(i, 0, -999, 0);
        bColAttr.setXYZ(i, 0, 0, 0);
      }
    }

    breathPoints.visible = anyActiveBreath;
    if (anyActiveBreath) {
      bPosAttr.needsUpdate = true;
      bColAttr.needsUpdate = true;
    }

    return breathPulse;
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
