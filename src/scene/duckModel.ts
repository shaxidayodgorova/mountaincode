import * as THREE from 'three';

export interface DuckRig {
  group: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  lowerBeak: THREE.Mesh;
  leftWing: THREE.Mesh;
  rightWing: THREE.Mesh;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  contactShadow: THREE.Mesh;
  hitProxy: THREE.Mesh;
  beakTipAnchor: THREE.Object3D;
  setHoverHighlight: (hovered: boolean) => void;
  updateAnimation: (
    time: number,
    delta: number,
    moveSpeed: number,
    coldFactor: number,
    breathPulse: number,
  ) => void;
  dispose: () => void;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.06,
    size / 2,
    size / 2,
    size * 0.48,
  );
  grad.addColorStop(0, 'rgba(10, 18, 32, 0.55)');
  grad.addColorStop(0.55, 'rgba(10, 18, 32, 0.22)');
  grad.addColorStop(1, 'rgba(10, 18, 32, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWebbedFootGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.05);
  shape.quadraticCurveTo(0.14, 0.05, 0.24, 0.34);
  shape.quadraticCurveTo(0.14, 0.4, 0.08, 0.32);
  shape.quadraticCurveTo(0.04, 0.42, 0, 0.42);
  shape.quadraticCurveTo(-0.04, 0.42, -0.08, 0.32);
  shape.quadraticCurveTo(-0.14, 0.4, -0.24, 0.34);
  shape.quadraticCurveTo(-0.14, 0.05, 0, -0.05);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.02,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geo.rotateX(Math.PI / 2);
  geo.computeVertexNormals();
  return geo;
}

function createWingGeometry(): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.16);
  shape.bezierCurveTo(0.28, 0.2, 0.46, 0.04, 0.44, -0.14);
  shape.bezierCurveTo(0.4, -0.28, 0.14, -0.24, -0.08, -0.14);
  shape.bezierCurveTo(-0.22, -0.06, -0.18, 0.14, 0, 0.16);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.035,
    bevelSegments: 4,
    curveSegments: 14,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

export function createRubberDuck(): DuckRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  // Materials with varied roughness/clearcoat between rubber, beak, eyes, and feet
  const rubberMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ffd324'),
      roughness: 0.28,
      metalness: 0.0,
      clearcoat: 0.48,
      clearcoatRoughness: 0.24,
      emissive: new THREE.Color('#000000'),
    }),
  );

  const beakMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ff6a1a'),
      roughness: 0.36,
      metalness: 0.0,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    }),
  );

  const feetMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f76b15'),
      roughness: 0.62,
      metalness: 0.0,
    }),
  );

  const eyeMat = track(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#141923'),
      roughness: 0.06,
      metalness: 0.05,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
  );

  const catchlightMat = track(
    new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffffff'),
    }),
  );

  const cheekMat = track(
    new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ff8470'),
      roughness: 0.55,
      metalness: 0.0,
      transparent: true,
      opacity: 0.65,
    }),
  );

  const group = new THREE.Group();
  group.name = 'RubberDuckRoot';

  // Contact shadow at ground plane y = 0.02
  const shadowTex = track(createContactShadowTexture());
  const shadowGeo = track(new THREE.PlaneGeometry(1.75, 1.95));
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.5,
    }),
  );
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.03;
  group.add(contactShadow);

  // Feet (grounded at y = 0.06..0.09)
  const footGeo = track(createWebbedFootGeometry());
  const ankleGeo = track(new THREE.CylinderGeometry(0.055, 0.065, 0.14, 12));

  const createFoot = (xOffset: number): THREE.Group => {
    const footPivot = new THREE.Group();
    footPivot.position.set(xOffset, 0.18, 0.04);

    const ankle = new THREE.Mesh(ankleGeo, feetMat);
    ankle.position.set(0, -0.06, 0);
    ankle.castShadow = true;
    footPivot.add(ankle);

    const pad = new THREE.Mesh(footGeo, feetMat);
    pad.position.set(0, -0.1, -0.02);
    pad.castShadow = true;
    pad.receiveShadow = true;
    footPivot.add(pad);

    return footPivot;
  };

  const leftFoot = createFoot(-0.22);
  const rightFoot = createFoot(0.22);
  group.add(leftFoot, rightFoot);

  // Body pivot sits slightly above feet for waddle & bounce
  const bodyPivot = new THREE.Group();
  bodyPivot.position.set(0, 0.56, 0);
  group.add(bodyPivot);

  // 1. Primary Body (sculpted plump bath-duck torso)
  const bodyGeo = track(new THREE.SphereGeometry(0.52, 32, 24));
  bodyGeo.scale(0.95, 0.78, 1.24);
  const bodyMesh = new THREE.Mesh(bodyGeo, rubberMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodyPivot.add(bodyMesh);

  // 2. Plump Chest / Breast bulge
  const chestGeo = track(new THREE.SphereGeometry(0.38, 24, 18));
  chestGeo.scale(0.92, 0.9, 0.9);
  const chestMesh = new THREE.Mesh(chestGeo, rubberMat);
  chestMesh.position.set(0, 0.12, 0.3);
  chestMesh.castShadow = true;
  bodyPivot.add(chestMesh);

  // 3. Upturned Classic Tail
  const tailGeo = track(new THREE.ConeGeometry(0.24, 0.44, 20));
  tailGeo.rotateX(-Math.PI * 0.38);
  const tailMesh = new THREE.Mesh(tailGeo, rubberMat);
  tailMesh.position.set(0, 0.22, -0.58);
  tailMesh.castShadow = true;
  bodyPivot.add(tailMesh);

  // 4 & 5. Sculpted Wings (Left & Right)
  const wingGeo = track(createWingGeometry());
  const leftWing = new THREE.Mesh(wingGeo, rubberMat);
  leftWing.rotation.y = Math.PI / 2 - 0.18;
  leftWing.rotation.z = 0.12;
  leftWing.position.set(-0.46, 0.04, -0.02);
  leftWing.castShadow = true;
  bodyPivot.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, rubberMat);
  rightWing.rotation.y = -Math.PI / 2 + 0.18;
  rightWing.rotation.z = -0.12;
  rightWing.position.set(0.46, 0.04, -0.02);
  rightWing.castShadow = true;
  bodyPivot.add(rightWing);

  // 6. Neck bridge
  const neckGeo = track(new THREE.CylinderGeometry(0.24, 0.3, 0.24, 20));
  const neckMesh = new THREE.Mesh(neckGeo, rubberMat);
  neckMesh.position.set(0, 0.38, 0.24);
  neckMesh.castShadow = true;
  bodyPivot.add(neckMesh);

  // Head Group
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.62, 0.28);
  bodyPivot.add(headGroup);

  // 7. Cute Round Head
  const headGeo = track(new THREE.SphereGeometry(0.36, 30, 24));
  headGeo.scale(1.02, 0.96, 1.04);
  const headMesh = new THREE.Mesh(headGeo, rubberMat);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);

  // 8. Signature Bath-Duck Head Tuft Curl
  const tuftGeo = track(new THREE.ConeGeometry(0.075, 0.18, 12));
  const tuftMain = new THREE.Mesh(tuftGeo, rubberMat);
  tuftMain.position.set(0, 0.37, -0.02);
  tuftMain.rotation.x = -0.35;
  tuftMain.castShadow = true;
  headGroup.add(tuftMain);

  const tuftSubGeo = track(new THREE.ConeGeometry(0.05, 0.12, 10));
  const tuftSub = new THREE.Mesh(tuftSubGeo, rubberMat);
  tuftSub.position.set(0.03, 0.34, -0.08);
  tuftSub.rotation.x = -0.65;
  tuftSub.rotation.z = -0.25;
  headGroup.add(tuftSub);

  // 9. Expressive Eyes + Specular Catchlights
  const eyeGeo = track(new THREE.SphereGeometry(0.062, 16, 16));
  const catchGeo = track(new THREE.SphereGeometry(0.02, 10, 10));

  const addEye = (xSign: number) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(xSign * 0.185, 0.08, 0.285);
    headGroup.add(eye);

    const catchlight = new THREE.Mesh(catchGeo, catchlightMat);
    catchlight.position.set(xSign * 0.195, 0.105, 0.335);
    headGroup.add(catchlight);
  };
  addEye(-1);
  addEye(1);

  // 10. Rosy Cheeks
  const cheekGeo = track(new THREE.SphereGeometry(0.072, 14, 14));
  cheekGeo.scale(1.15, 0.72, 0.45);
  const leftCheek = new THREE.Mesh(cheekGeo, cheekMat);
  leftCheek.position.set(-0.26, -0.04, 0.22);
  leftCheek.rotation.y = -0.5;
  const rightCheek = new THREE.Mesh(cheekGeo, cheekMat);
  rightCheek.position.set(0.26, -0.04, 0.22);
  rightCheek.rotation.y = 0.5;
  headGroup.add(leftCheek, rightCheek);

  // 11. Two-Part Rounded Duck Beak (Upper + Lower)
  const upperBeakGeo = track(new THREE.SphereGeometry(0.16, 20, 16));
  upperBeakGeo.scale(1.18, 0.45, 1.38);
  const upperBeak = new THREE.Mesh(upperBeakGeo, beakMat);
  upperBeak.position.set(0, -0.02, 0.42);
  upperBeak.rotation.x = 0.06;
  upperBeak.castShadow = true;
  headGroup.add(upperBeak);

  const lowerBeakGeo = track(new THREE.SphereGeometry(0.135, 18, 14));
  lowerBeakGeo.scale(1.06, 0.34, 1.22);
  const lowerBeak = new THREE.Mesh(lowerBeakGeo, beakMat);
  lowerBeak.position.set(0, -0.075, 0.39);
  lowerBeak.castShadow = true;
  headGroup.add(lowerBeak);

  // Anchor at tip of beak for cold breath vapor emission
  const beakTipAnchor = new THREE.Object3D();
  beakTipAnchor.position.set(0, -0.045, 0.62);
  headGroup.add(beakTipAnchor);

  // Invisible generous hit proxy on Layer 1 for easy drag picking
  const hitGeo = track(new THREE.SphereGeometry(1.15, 12, 12));
  const hitMat = track(
    new THREE.MeshBasicMaterial({
      visible: false,
    }),
  );
  const hitProxy = new THREE.Mesh(hitGeo, hitMat);
  hitProxy.position.set(0, 0.78, 0.08);
  hitProxy.layers.set(1);
  group.add(hitProxy);

  let walkPhase = 0;
  let hoverBlend = 0;
  let isHovered = false;

  const setHoverHighlight = (hovered: boolean) => {
    isHovered = hovered;
  };

  const updateAnimation = (
    time: number,
    delta: number,
    moveSpeed: number,
    coldFactor: number,
    breathPulse: number,
  ) => {
    const absSpeed = Math.min(Math.abs(moveSpeed), 3.5);
    const moving = absSpeed > 0.02;

    if (moving) {
      walkPhase += delta * (4.8 + absSpeed * 4.2);
    } else {
      // Gently relax walkPhase toward neutral
      walkPhase += delta * 1.4;
    }

    // Hover glow smoothly damped
    hoverBlend = THREE.MathUtils.damp(hoverBlend, isHovered ? 1 : 0, 10, delta);
    rubberMat.emissive.setRGB(0.18 * hoverBlend, 0.14 * hoverBlend, 0.02 * hoverBlend);

    // Cold cheek flush
    cheekMat.opacity = 0.55 + coldFactor * 0.35;

    // Waddle roll & cheerful step hop
    const moveBlend = THREE.MathUtils.clamp(absSpeed * 3.0, 0, 1);
    const strideSin = Math.sin(walkPhase);
    const stepBounce = Math.abs(strideSin) * 0.085 * moveBlend;
    const idleBob = Math.sin(time * 2.2) * 0.022 * (1 - moveBlend);

    // Cold shiver at high altitude (>3200m)
    const shiver = coldFactor > 0.25 ? Math.sin(time * 38) * 0.012 * coldFactor : 0;

    bodyPivot.position.y = 0.56 + stepBounce + idleBob;
    bodyPivot.rotation.z = strideSin * 0.095 * moveBlend + shiver;
    bodyPivot.rotation.x = (moving ? -0.06 : 0) + Math.sin(time * 1.7) * 0.02;

    // Alternating webbed feet stride
    leftFoot.position.y = 0.18 + Math.max(0, strideSin) * 0.13 * moveBlend;
    leftFoot.position.z = 0.04 + strideSin * 0.14 * moveBlend;
    leftFoot.rotation.x = -strideSin * 0.28 * moveBlend;

    rightFoot.position.y = 0.18 + Math.max(0, -strideSin) * 0.13 * moveBlend;
    rightFoot.position.z = 0.04 - strideSin * 0.14 * moveBlend;
    rightFoot.rotation.x = strideSin * 0.28 * moveBlend;

    // Wing flap / balance
    const wingBase = 0.12 + moveBlend * 0.08;
    const wingFlap = Math.sin(walkPhase * 1.0) * 0.16 * moveBlend + Math.sin(time * 2.4) * 0.03;
    leftWing.rotation.z = wingBase + wingFlap;
    rightWing.rotation.z = -(wingBase + wingFlap);

    // Cute head look & shiver
    headGroup.rotation.z = -strideSin * 0.04 * moveBlend + shiver * 1.4;
    headGroup.rotation.y = Math.sin(time * 0.9) * 0.07 * (1 - moveBlend * 0.6);
    headGroup.rotation.x = Math.sin(time * 1.8) * 0.035;

    // Subtle beak opening when exhaling cold breath steam
    const beakOpen = breathPulse * 0.22;
    lowerBeak.rotation.x = beakOpen;
    lowerBeak.position.y = -0.075 - beakOpen * 0.05;
  };

  const dispose = () => {
    for (const item of disposables) {
      item.dispose();
    }
  };

  return {
    group,
    bodyPivot,
    headGroup,
    lowerBeak,
    leftWing,
    rightWing,
    leftFoot,
    rightFoot,
    contactShadow,
    hitProxy,
    beakTipAnchor,
    setHoverHighlight,
    updateAnimation,
    dispose,
  };
}
