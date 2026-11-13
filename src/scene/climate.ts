import * as THREE from 'three';

export const MAX_ALTITUDE_METERS = 5000;
export const MOUNTAIN_WORLD_HEIGHT = 100; // 1 world unit = 50 m

export type CameraPreset = 'side' | 'front' | 'panorama';

export interface ClimateState {
  altitudeMeters: number;
  progress: number;
  temperatureC: number;
  zoneName: string;
  zoneDescription: string;
  thermalLabel: string;
  thermalTone: 'warm' | 'cool' | 'cold' | 'freezing';
  windStrength: number; // 0..1
  snowIntensity: number; // 0..1
  breathIntensity: number; // 0..1
  coldTint: number; // 0..1
}

/**
 * Standard atmospheric lapse rate formula from specification:
 * 15°C - (altitude / 1000 * 6.5)
 */
export function calculateTemperatureC(altitudeMeters: number): number {
  return 15 - (altitudeMeters / 1000) * 6.5;
}

export function formatAltitudeRu(altitudeMeters: number): string {
  const rounded = Math.round(altitudeMeters);
  return `${rounded.toLocaleString('ru-RU')} м`;
}

export function formatTemperatureRu(tempC: number): string {
  const rounded = Math.round(tempC * 10) / 10;
  const isZero = Math.abs(rounded) < 0.05;
  if (isZero) {
    return '0 °C';
  }
  const absFormatted = Number.isInteger(Math.abs(rounded))
    ? Math.abs(rounded).toFixed(0)
    : Math.abs(rounded).toFixed(1);
  return rounded > 0 ? `+${absFormatted} °C` : `−${absFormatted} °C`;
}

export function getClimateState(altitudeMeters: number): ClimateState {
  const clampedAlt = THREE.MathUtils.clamp(altitudeMeters, 0, MAX_ALTITUDE_METERS);
  const progress = clampedAlt / MAX_ALTITUDE_METERS;
  const temperatureC = calculateTemperatureC(clampedAlt);

  let zoneName = 'Зелёная долина и лес';
  let zoneDescription = 'Тёплый воздух, луга и хвойный лес';
  if (clampedAlt >= 1500 && clampedAlt < 3000) {
    zoneName = 'Скалы и первый снег';
    zoneDescription = 'Тропа среди камней и редких снежников';
  } else if (clampedAlt >= 3000 && clampedAlt < 4200) {
    zoneName = 'Снега и ледники';
    zoneDescription = 'Холодный альпийский пояс, лёд и облака';
  } else if (clampedAlt >= 4200) {
    zoneName = 'Ледяная вершина';
    zoneDescription = 'Сильный ветер, метель и мороз';
  }

  let thermalLabel = 'Тепло';
  let thermalTone: ClimateState['thermalTone'] = 'warm';
  if (temperatureC <= -10) {
    thermalLabel = 'Лютый мороз';
    thermalTone = 'freezing';
  } else if (temperatureC <= 0) {
    thermalLabel = 'Мороз';
    thermalTone = 'cold';
  } else if (temperatureC < 8) {
    thermalLabel = 'Прохладно';
    thermalTone = 'cool';
  }

  const windStrength = THREE.MathUtils.smoothstep(clampedAlt, 1800, 4800);
  const snowIntensity = THREE.MathUtils.smoothstep(clampedAlt, 2500, 4700);
  const breathIntensity = THREE.MathUtils.smoothstep(clampedAlt, 2200, 4300);
  const coldTint = THREE.MathUtils.smoothstep(clampedAlt, 1600, 4600);

  return {
    altitudeMeters: clampedAlt,
    progress,
    temperatureC,
    zoneName,
    zoneDescription,
    thermalLabel,
    thermalTone,
    windStrength,
    snowIntensity,
    breathIntensity,
    coldTint,
  };
}

// Reusable colors for frame-rate-independent sky/fog/lighting transitions (no GC)
const SKY_WARM = new THREE.Color('#78b9f0');
const SKY_MID = new THREE.Color('#86b0db');
const SKY_COLD = new THREE.Color('#5a7da8');
const SKY_SUMMIT = new THREE.Color('#446591');

const FOG_WARM = new THREE.Color('#b6daf5');
const FOG_MID = new THREE.Color('#b4cce6');
const FOG_COLD = new THREE.Color('#89a8cc');

const SUN_WARM = new THREE.Color('#fff1d0');
const SUN_COLD = new THREE.Color('#d4e8ff');

const HEMI_SKY_WARM = new THREE.Color('#9cd1ff');
const HEMI_SKY_COLD = new THREE.Color('#7fa9dc');

const HEMI_GND_WARM = new THREE.Color('#4a6b3d');
const HEMI_GND_COLD = new THREE.Color('#5a7594');

export function applyAltitudeAtmosphere(
  altitudeMeters: number,
  outSky: THREE.Color,
  outFog: THREE.Color,
  outSun: THREE.Color,
  outHemiSky: THREE.Color,
  outHemiGround: THREE.Color,
): void {
  const t1 = THREE.MathUtils.clamp(altitudeMeters / 2200, 0, 1);
  const t2 = THREE.MathUtils.clamp((altitudeMeters - 2200) / 1800, 0, 1);
  const t3 = THREE.MathUtils.clamp((altitudeMeters - 3800) / 1200, 0, 1);

  outSky.copy(SKY_WARM).lerp(SKY_MID, t1).lerp(SKY_COLD, t2).lerp(SKY_SUMMIT, t3);
  outFog.copy(FOG_WARM).lerp(FOG_MID, t1).lerp(FOG_COLD, Math.min(1, t2 + t3 * 0.4));

  const coldMix = THREE.MathUtils.smoothstep(altitudeMeters, 1400, 4500);
  outSun.copy(SUN_WARM).lerp(SUN_COLD, coldMix);
  outHemiSky.copy(HEMI_SKY_WARM).lerp(HEMI_SKY_COLD, coldMix);
  outHemiGround.copy(HEMI_GND_WARM).lerp(HEMI_GND_COLD, coldMix);
}
