import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  MAX_ALTITUDE_METERS,
  CameraPreset,
  ClimateState,
  applyAltitudeAtmosphere,
  getClimateState,
} from './climate';
import { createRubberDuck, DuckRig } from './duckModel';
import { createMountainWorld, getTrailSample, MountainWorld } from './terrain';
import { createWeatherSystem, WeatherSystem } from './weather';

export interface SceneTelemetry extends ClimateState {
  isAutoClimbing: boolean;
  isDraggingDuck: boolean;
  isHoveredDuck: boolean;
  reachedSummit: boolean;
}

export interface ScreenBadgePos {
  x: number;
  y: number;
  visible: boolean;
}

export interface MountainSceneCallbacks {
  onTelemetry: (telemetry: SceneTelemetry) => void;
  onBadgePos: (pos: ScreenBadgePos) => void;
  onContextLost: (lost: boolean) => void;
}

// Module-scoped scratch objects to prevent per-frame GC allocations
const _duckPos = new THREE.Vector3();
const _prevDuckPos = new THREE.Vector3();
const _duckDelta = new THREE.Vector3();
const _duckTan = new THREE.Vector3();
const _duckForward = new THREE.Vector3();
const _beakWorldPos = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const _desiredTarget = new THREE.Vector3();
const _desiredCamPos = new THREE.Vector3();
const _camOffset = new THREE.Vector3();
const _badgeWorld = new THREE.Vector3();
const _badgeNdc = new THREE.Vector3();
const _skyColor = new THREE.Color();
const _fogColor = new THREE.Color();
const _sunColor = new THREE.Color();
const _hemiSkyColor = new THREE.Color();
const _hemiGroundColor = new THREE.Color();
const _upVec = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();
const _lookMat = new THREE.Matrix4();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class MountainScene {
  private container: HTMLElement;
  private callbacks: MountainSceneCallbacks;
  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private keyLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private envTexture: THREE.Texture;

  private mountain: MountainWorld;
  private duck: DuckRig;
  private weather: WeatherSystem;

  private currentAltitude = 180; // start near base valley (~180m) so user sees full climb or can drop to 0m
  private targetAltitude = 180;
  private climbSpeedMult = 1;
  private isAutoClimbing = false;
  private isDraggingDuck = false;
  private isHoveredDuck = false;
  private dragStartY = 0;
  private dragStartAlt = 0;

  private activeCamTransition = false;
  private transitionOffset = new THREE.Vector3();

  private keysDown = new Set<string>();
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();
  private lastHoverCheck = 0;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;
  private lastTelemetryEmit = 0;
  private lastEmittedAlt = -1;
  private lastAutoState = false;
  private lastDragState = false;
  private lastHoverState = false;

  constructor(container: HTMLElement, callbacks: MountainSceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#78b9f0');
    this.scene.fog = new THREE.FogExp2('#b6daf5', 0.0044);

    // Studio procedural environment reflections (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    pmremGenerator.dispose();

    this.camera = new THREE.PerspectiveCamera(46, width / height, 0.2, 650);

    // 3-point + hemisphere alpine lighting rig
    this.hemiLight = new THREE.HemisphereLight('#9cd1ff', '#4a6b3d', 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight('#fff1d0', 2.05);
    this.keyLight.position.set(45, 75, 42);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 5;
    this.keyLight.shadow.camera.far = 180;
    const d = 30;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight('#b6dcff', 0.72);
    this.rimLight.position.set(-40, 35, -45);
    this.scene.add(this.rimLight);

    // Build World, Duck, and Weather
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mountain = createMountainWorld(maxAniso);
    this.duck = createRubberDuck();
    this.weather = createWeatherSystem();
    this.scene.add(this.mountain.group, this.duck.group, this.weather.group);

    // Position duck at initial altitude
    this.syncDuckTransform(0, 1);

    // OrbitControls centered on duck
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.enableZoom = false; // Wheel controls duck climb/descent
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.25;
    this.controls.maxPolarAngle = Math.PI * 0.485;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 26;

    // Initial scenic camera framing (side-three-quarter view)
    this.applyCameraPresetImmediate('side');

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.emitTelemetry(true);
    this.tick();
  }

  private computePresetOffset(preset: CameraPreset, tangent: THREE.Vector3): THREE.Vector3 {
    const flatTan = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    if (flatTan.lengthSq() < 0.001) flatTan.set(0, 0, 1);
    const side = new THREE.Vector3(-flatTan.z, 0, flatTan.x).normalize();

    if (preset === 'front') {
      return flatTan.clone().multiplyScalar(5.8).addScaledVector(side, 2.6).add(new THREE.Vector3(0, 2.4, 0));
    }
    if (preset === 'panorama') {
      return flatTan.clone().multiplyScalar(-11.5).addScaledVector(side, 10.5).add(new THREE.Vector3(0, 6.2, 0));
    }
    // 'side' default: scenic three-quarter view showing duck, trail ahead, and valley/peak
    return flatTan.clone().multiplyScalar(-5.4).addScaledVector(side, 6.2).add(new THREE.Vector3(0, 3.1, 0));
  }

  private applyCameraPresetImmediate(preset: CameraPreset): void {
    getTrailSample(this.currentAltitude / MAX_ALTITUDE_METERS, _duckPos, _duckTan);
    _desiredTarget.copy(_duckPos).add(new THREE.Vector3(0, 0.9, 0));
    const offset = this.computePresetOffset(preset, _duckTan);
    this.controls.target.copy(_desiredTarget);
    this.camera.position.copy(_desiredTarget).add(offset);
    this.controls.update();
  }

  public setCameraPreset(preset: CameraPreset): void {
    getTrailSample(this.currentAltitude / MAX_ALTITUDE_METERS, _duckPos, _duckTan);
    this.transitionOffset.copy(this.computePresetOffset(preset, _duckTan));
    this.activeCamTransition = true;
  }

  public setTargetAltitude(altitudeMeters: number, stopAuto = true): void {
    this.targetAltitude = THREE.MathUtils.clamp(altitudeMeters, 0, MAX_ALTITUDE_METERS);
    if (stopAuto) {
      this.isAutoClimbing = false;
    }
  }

  public setAutoClimb(active: boolean): void {
    if (active && this.currentAltitude >= MAX_ALTITUDE_METERS - 2) {
      // If already at summit, restart climb from base smoothly
      this.targetAltitude = 0;
      this.currentAltitude = 0;
    }
    this.isAutoClimbing = active;
    this.emitTelemetry(true);
  }

  public setSpeedMultiplier(mult: number): void {
    this.climbSpeedMult = mult;
  }

  public resetToBase(): void {
    this.isAutoClimbing = false;
    this.targetAltitude = 0;
    this.emitTelemetry(true);
  }

  private syncDuckTransform(delta: number, dampLambda: number): void {
    _prevDuckPos.copy(this.duck.group.position);

    const progress = THREE.MathUtils.clamp(this.currentAltitude / MAX_ALTITUDE_METERS, 0, 1);
    getTrailSample(progress, _duckPos, _duckTan);
    this.duck.group.position.copy(_duckPos);

    // Orient duck smoothly along trail tangent (with gentle uphill pitch)
    _lookTarget.copy(_duckPos).add(_duckTan);
    // Soften vertical pitch slightly so duck doesn't tilt awkwardly
    _lookTarget.y = _duckPos.y + _duckTan.y * 0.55;
    _lookMat.lookAt(_lookTarget, _duckPos, _upVec);
    _targetQuat.setFromRotationMatrix(_lookMat);

    if (delta <= 0) {
      this.duck.group.quaternion.copy(_targetQuat);
    } else {
      const alpha = 1 - Math.exp(-dampLambda * delta);
      this.duck.group.quaternion.slerp(_targetQuat, alpha);
    }

    _duckDelta.subVectors(this.duck.group.position, _prevDuckPos);
  }

  private updatePointerNdc(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private checkDuckHover(): boolean {
    this.raycaster.layers.set(1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const hits = this.raycaster.intersectObject(this.duck.hitProxy, false);
    return hits.length > 0;
  }

  private onPointerDown = (e: PointerEvent) => {
    this.updatePointerNdc(e.clientX, e.clientY);
    if (e.button === 0 && this.checkDuckHover()) {
      this.isDraggingDuck = true;
      this.dragStartY = e.clientY;
      this.dragStartAlt = this.targetAltitude;
      this.isAutoClimbing = false;
      this.controls.enabled = false;
      this.renderer.domElement.style.cursor = 'grabbing';
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.emitTelemetry(true);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.isDraggingDuck) {
      const dy = this.dragStartY - e.clientY; // positive when dragging UP
      const sensitivity = MAX_ALTITUDE_METERS / Math.max(window.innerHeight * 0.62, 320);
      this.targetAltitude = THREE.MathUtils.clamp(
        this.dragStartAlt + dy * sensitivity,
        0,
        MAX_ALTITUDE_METERS,
      );
      return;
    }

    const now = performance.now();
    if (now - this.lastHoverCheck < 45) return;
    this.lastHoverCheck = now;

    this.updatePointerNdc(e.clientX, e.clientY);
    const hovered = this.checkDuckHover();
    if (hovered !== this.isHoveredDuck) {
      this.isHoveredDuck = hovered;
      this.duck.setHoverHighlight(hovered);
      this.renderer.domElement.style.cursor = hovered ? 'grab' : 'default';
    }
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.isDraggingDuck) {
      this.isDraggingDuck = false;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = this.isHoveredDuck ? 'grab' : 'default';
      if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
        this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
      this.emitTelemetry(true);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.isAutoClimbing = false;
    // Scroll up (deltaY < 0) climbs UP; scroll down (deltaY > 0) descends
    const step = -e.deltaY * 1.45;
    this.targetAltitude = THREE.MathUtils.clamp(this.targetAltitude + step, 0, MAX_ALTITUDE_METERS);
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW' || e.code === 'KeyS') {
      this.keysDown.add(e.code);
      this.isAutoClimbing = false;
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keysDown.delete(e.code);
  };

  private onControlsStart = () => {
    this.activeCamTransition = false;
  };

  private onResize = () => {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.callbacks.onContextLost(true);
  };

  private onContextRestored = () => {
    this.callbacks.onContextLost(false);
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.controls.addEventListener('start', this.onControlsStart);
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  private unbindEvents(): void {
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.controls.removeEventListener('start', this.onControlsStart);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
  }

  private emitTelemetry(force = false): void {
    const now = performance.now();
    const altChanged = Math.abs(this.currentAltitude - this.lastEmittedAlt) >= 0.6;
    const stateChanged =
      this.isAutoClimbing !== this.lastAutoState ||
      this.isDraggingDuck !== this.lastDragState ||
      this.isHoveredDuck !== this.lastHoverState;

    if (!force && !stateChanged && (!altChanged || now - this.lastTelemetryEmit < 50)) {
      return;
    }

    this.lastTelemetryEmit = now;
    this.lastEmittedAlt = this.currentAltitude;
    this.lastAutoState = this.isAutoClimbing;
    this.lastDragState = this.isDraggingDuck;
    this.lastHoverState = this.isHoveredDuck;

    const climate = getClimateState(this.currentAltitude);
    this.callbacks.onTelemetry({
      ...climate,
      isAutoClimbing: this.isAutoClimbing,
      isDraggingDuck: this.isDraggingDuck,
      isHoveredDuck: this.isHoveredDuck,
      reachedSummit: this.currentAltitude >= MAX_ALTITUDE_METERS - 2,
    });
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const delta = Math.min(this.clock.getDelta(), 0.08);
    const elapsed = this.clock.getElapsedTime();

    // Keyboard Arrow / W-S climb
    const keyClimb =
      (this.keysDown.has('ArrowUp') || this.keysDown.has('KeyW') ? 1 : 0) -
      (this.keysDown.has('ArrowDown') || this.keysDown.has('KeyS') ? 1 : 0);
    if (keyClimb !== 0) {
      this.targetAltitude = THREE.MathUtils.clamp(
        this.targetAltitude + keyClimb * 560 * this.climbSpeedMult * delta,
        0,
        MAX_ALTITUDE_METERS,
      );
    }

    // Auto-climb mode
    if (this.isAutoClimbing) {
      const climbRate = 240 * this.climbSpeedMult; // ~21s at 1x for full 5000m climb
      this.targetAltitude = Math.min(MAX_ALTITUDE_METERS, this.targetAltitude + climbRate * delta);
      if (this.targetAltitude >= MAX_ALTITUDE_METERS - 0.1 && this.currentAltitude >= MAX_ALTITUDE_METERS - 1.5) {
        this.targetAltitude = MAX_ALTITUDE_METERS;
        this.isAutoClimbing = false;
      }
    }

    // Smoothly damp currentAltitude toward targetAltitude
    const prevAlt = this.currentAltitude;
    this.currentAltitude = THREE.MathUtils.damp(this.currentAltitude, this.targetAltitude, 8.5, delta);
    if (Math.abs(this.currentAltitude - this.targetAltitude) < 0.05) {
      this.currentAltitude = this.targetAltitude;
    }

    const altVelocity = Math.abs(this.currentAltitude - prevAlt) / Math.max(delta, 0.001);
    const normalizedWalkSpeed = THREE.MathUtils.clamp(altVelocity / 240, 0, 3.0);

    // Sync duck position & orientation on the mountain trail
    this.syncDuckTransform(delta, 12);

    // Move camera + OrbitControls target along with the duck
    this.controls.target.add(_duckDelta);
    this.camera.position.add(_duckDelta);

    // Smoothly handle preset camera transitions
    if (this.activeCamTransition) {
      _desiredTarget.copy(this.duck.group.position).add(new THREE.Vector3(0, 0.9, 0));
      _desiredCamPos.copy(_desiredTarget).add(this.transitionOffset);

      const tAlpha = 1 - Math.exp(-5.5 * delta);
      this.controls.target.lerp(_desiredTarget, tAlpha);
      this.camera.position.lerp(_desiredCamPos, tAlpha);

      if (this.camera.position.distanceTo(_desiredCamPos) < 0.08) {
        this.activeCamTransition = false;
      }
    } else {
      // Keep camera from dipping below local mountain ground
      _camOffset.subVectors(this.camera.position, this.controls.target);
      const minY = this.duck.group.position.y + 0.8;
      if (this.camera.position.y < minY) {
        this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, minY, 10, delta);
      }
    }

    this.controls.update();

    // Update climate atmosphere (sky, fog, light color temperature)
    const climate = getClimateState(this.currentAltitude);
    applyAltitudeAtmosphere(
      this.currentAltitude,
      _skyColor,
      _fogColor,
      _sunColor,
      _hemiSkyColor,
      _hemiGroundColor,
    );
    (this.scene.background as THREE.Color).copy(_skyColor);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(_fogColor);
      // Slightly denser atmospheric mist around clouds & summit snowstorm
      this.scene.fog.density = 0.004 + climate.snowIntensity * 0.0022;
    }
    this.keyLight.color.copy(_sunColor);
    this.hemiLight.color.copy(_hemiSkyColor);
    this.hemiLight.groundColor.copy(_hemiGroundColor);

    // Keep shadow camera centered around the duck for crisp shadows at every altitude
    this.keyLight.target.position.copy(this.duck.group.position);
    this.keyLight.position.set(
      this.duck.group.position.x + 32,
      this.duck.group.position.y + 52,
      this.duck.group.position.z + 28,
    );

    // Update mountain flag, weather, and duck breath
    this.mountain.update(elapsed, climate.windStrength);
    this.duck.group.updateMatrixWorld();
    this.duck.beakTipAnchor.getWorldPosition(_beakWorldPos);
    _duckForward.set(0, 0, 1).applyQuaternion(this.duck.group.quaternion).normalize();

    const breathPulse = this.weather.update(
      delta,
      elapsed,
      this.duck.group.position,
      _beakWorldPos,
      _duckForward,
      climate.windStrength,
      climate.snowIntensity,
      climate.breathIntensity,
    );

    this.duck.updateAnimation(elapsed, delta, normalizedWalkSpeed, climate.coldTint, breathPulse);

    // Project floating badge anchor just above duck's head
    _badgeWorld.copy(this.duck.group.position);
    _badgeWorld.y += 2.15;
    _badgeNdc.copy(_badgeWorld).project(this.camera);

    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const inFront = _badgeNdc.z < 1 && _badgeNdc.z > -1;
    const bx = ((_badgeNdc.x + 1) / 2) * w;
    const by = ((-_badgeNdc.y + 1) / 2) * h;
    const onScreen = inFront && bx > 40 && bx < w - 40 && by > 40 && by < h - 40;
    this.callbacks.onBadgePos({ x: bx, y: by, visible: onScreen });

    this.emitTelemetry(false);

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.unbindEvents();
    this.controls.dispose();
    this.mountain.dispose();
    this.duck.dispose();
    this.weather.dispose();
    this.envTexture.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
