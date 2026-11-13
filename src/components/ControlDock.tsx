import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import {
  CameraPreset,
  formatAltitudeRu,
  MAX_ALTITUDE_METERS,
} from '../scene/climate';

interface ControlDockProps {
  altitudeMeters: number;
  isAutoClimbing: boolean;
  reachedSummit: boolean;
  speedMult: number;
  cameraPreset: CameraPreset;
  collapsed: boolean;
  onToggleAutoClimb: () => void;
  onResetBase: () => void;
  onAltitudeChange: (alt: number) => void;
  onSpeedChange: (mult: number) => void;
  onCameraPresetChange: (preset: CameraPreset) => void;
  onToggleCollapse: () => void;
}

const CAMERA_OPTIONS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'side', label: 'Сбоку' },
  { id: 'front', label: 'Спереди' },
  { id: 'panorama', label: 'Панорама' },
];

export const ControlDock: React.FC<ControlDockProps> = ({
  altitudeMeters,
  isAutoClimbing,
  reachedSummit,
  speedMult,
  cameraPreset,
  collapsed,
  onToggleAutoClimb,
  onResetBase,
  onAltitudeChange,
  onSpeedChange,
  onCameraPresetChange,
  onToggleCollapse,
}) => {
  const autoLabel = isAutoClimbing
    ? 'Пауза'
    : reachedSummit
      ? 'Подняться снова'
      : 'Автоподъём';

  return (
    <div
      className="fixed bottom-5 left-1/2 z-20 w-[min(900px,94vw)] -translate-x-1/2 flex flex-col items-center pointer-events-none"
    >
      {/* Collapse / Expand Handle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="pointer-events-auto mb-1.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-950/86 px-3 py-1 text-xs font-medium text-slate-200 border border-white/12 hover:bg-slate-900 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        title="Скрыть или показать панель (клавиша H)"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Показать панель</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Скрыть панель</span>
          </>
        )}
      </button>

      {/* Main Collapsible Dock */}
      <div
        className={`w-full rounded-xl bg-slate-950/88 border border-white/12 px-4 py-3 text-slate-100 shadow-xl transition-all duration-300 ${
          collapsed
            ? 'translate-y-24 opacity-0 pointer-events-none'
            : 'translate-y-0 opacity-100 pointer-events-auto'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Primary Action: Auto Climb + Reset */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onToggleAutoClimb}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isAutoClimbing
                  ? 'bg-amber-400 text-slate-950 hover:bg-amber-300'
                  : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
              }`}
            >
              {isAutoClimbing ? (
                <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
              ) : (
                <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              )}
              <span>{autoLabel}</span>
            </button>

            <button
              type="button"
              onClick={onResetBase}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/15 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Спуститься к подножию (0 м)"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>0 м</span>
            </button>
          </div>

          {/* Altitude Scrubber */}
          <div className="flex-1 min-w-[180px] flex items-center gap-3 px-1">
            <label
              htmlFor="altitude-range"
              className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0"
            >
              Склон
            </label>
            <input
              id="altitude-range"
              type="range"
              min={0}
              max={MAX_ALTITUDE_METERS}
              step={5}
              value={Math.round(altitudeMeters)}
              onChange={(e) => onAltitudeChange(Number(e.target.value))}
              className="altitude-slider w-full"
              aria-label="Высота подъёма уточки в метрах"
            />
            <span className="font-mono-tabular text-xs font-semibold text-amber-300 w-16 text-right whitespace-nowrap shrink-0">
              {formatAltitudeRu(altitudeMeters)}
            </span>
          </div>

          {/* Speed & Camera Presets */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="flex items-center rounded-lg bg-white/6 p-0.5 border border-white/8"
              role="group"
              aria-label="Скорость автоподъёма"
            >
              {[1, 2].map((mult) => (
                <button
                  key={mult}
                  type="button"
                  onClick={() => onSpeedChange(mult)}
                  className={`px-2.5 py-1 text-xs font-mono-tabular font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    speedMult === mult
                      ? 'bg-white/18 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mult}×
                </button>
              ))}
            </div>

            <div
              className="hidden sm:flex items-center rounded-lg bg-white/6 p-0.5 border border-white/8"
              role="group"
              aria-label="Ракурс камеры"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400 ml-2 mr-1 shrink-0" aria-hidden="true" />
              {CAMERA_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onCameraPresetChange(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    cameraPreset === opt.id
                      ? 'bg-white/18 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Concise Control Hint */}
        <div className="mt-2 pt-2 border-t border-white/8 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            Тяните уточку мышью вверх-вниз · Колесо мыши или клавиши ↑ ↓ для подъёма · Тяните фон для обзора
          </span>
        </div>
      </div>
    </div>
  );
};
