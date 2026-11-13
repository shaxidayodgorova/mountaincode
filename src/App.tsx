/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { TelemetryHud } from './components/TelemetryHud';
import { CameraPreset, getClimateState } from './scene/climate';
import { MountainScene, SceneTelemetry, ScreenBadgePos } from './scene/MountainScene';

const INITIAL_TELEMETRY: SceneTelemetry = {
  ...getClimateState(180),
  isAutoClimbing: false,
  isDraggingDuck: false,
  isHoveredDuck: false,
  reachedSummit: false,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<MountainScene | null>(null);
  const badgeRef = useRef<HTMLDivElement | null>(null);

  const [telemetry, setTelemetry] = useState<SceneTelemetry>(INITIAL_TELEMETRY);
  const [speedMult, setSpeedMult] = useState<number>(1);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('side');
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [contextLost, setContextLost] = useState<boolean>(false);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const scene = new MountainScene(mount, {
      onTelemetry: (next) => {
        setTelemetry(next);
      },
      onBadgePos: (pos: ScreenBadgePos) => {
        const el = badgeRef.current;
        if (!el) return;
        if (!pos.visible) {
          el.style.transform = 'translate3d(-9999px, -9999px, 0)';
        } else {
          el.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0) translate(-50%, -100%)`;
        }
      },
      onContextLost: (lost) => {
        setContextLost(lost);
      },
    });

    sceneRef.current = scene;

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Keyboard shortcut H to toggle Zen / collapsed dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyH' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleToggleAutoClimb = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.setAutoClimb(!telemetry.isAutoClimbing);
  }, [telemetry.isAutoClimbing]);

  const handleResetBase = useCallback(() => {
    sceneRef.current?.resetToBase();
  }, []);

  const handleAltitudeChange = useCallback((alt: number) => {
    sceneRef.current?.setTargetAltitude(alt, true);
  }, []);

  const handleSpeedChange = useCallback((mult: number) => {
    setSpeedMult(mult);
    sceneRef.current?.setSpeedMultiplier(mult);
  }, []);

  const handleCameraPresetChange = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    sceneRef.current?.setCameraPreset(preset);
  }, []);

  const handleToggleCollapse = useCallback(() => {
    setDockCollapsed((prev) => !prev);
  }, []);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* Isolated WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        className="w-full h-full"
        aria-label="Интерактивная 3D-сцена: гора высотой 5000 метров и резиновая уточка"
      />

      {/* WebGL Context Loss Graceful Overlay */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-6 text-center">
          <div className="max-w-sm rounded-xl bg-slate-900 border border-white/15 p-6 text-slate-100">
            <h2 className="font-display text-lg font-bold text-white">
              Восстановление 3D-сцены
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              Контекст WebGL был временно приостановлен браузером. Попробуйте обновить страницу, если сцена не восстановится автоматически.
            </p>
          </div>
        </div>
      )}

      {/* Telemetry HUD & Near-Duck Label */}
      <TelemetryHud
        telemetry={telemetry}
        badgeRef={badgeRef}
        zenMode={dockCollapsed}
      />

      {/* Collapsible Bottom Control Dock */}
      <ControlDock
        altitudeMeters={telemetry.altitudeMeters}
        isAutoClimbing={telemetry.isAutoClimbing}
        reachedSummit={telemetry.reachedSummit}
        speedMult={speedMult}
        cameraPreset={cameraPreset}
        collapsed={dockCollapsed}
        onToggleAutoClimb={handleToggleAutoClimb}
        onResetBase={handleResetBase}
        onAltitudeChange={handleAltitudeChange}
        onSpeedChange={handleSpeedChange}
        onCameraPresetChange={handleCameraPresetChange}
        onToggleCollapse={handleToggleCollapse}
      />
    </main>
  );
}
