import React from 'react';
import {
  formatAltitudeRu,
  formatTemperatureRu,
  MAX_ALTITUDE_METERS,
} from '../scene/climate';
import type { SceneTelemetry } from '../scene/MountainScene';

interface TelemetryHudProps {
  telemetry: SceneTelemetry;
  badgeRef: React.RefObject<HTMLDivElement | null>;
  zenMode: boolean;
}

const TONE_CLASSES: Record<SceneTelemetry['thermalTone'], string> = {
  warm: 'text-amber-300',
  cool: 'text-sky-200',
  cold: 'text-cyan-300',
  freezing: 'text-blue-200',
};

export const TelemetryHud: React.FC<TelemetryHudProps> = ({
  telemetry,
  badgeRef,
  zenMode,
}) => {
  const pct = Math.round((telemetry.altitudeMeters / MAX_ALTITUDE_METERS) * 100);
  const toneClass = TONE_CLASSES[telemetry.thermalTone];

  return (
    <>
      {/* Near-duck floating world-projected readout */}
      <div
        ref={badgeRef}
        aria-hidden="true"
        className={`pointer-events-none fixed top-0 left-0 z-10 transition-opacity duration-200 ${
          zenMode ? 'opacity-0' : 'opacity-100'
        }`}
        style={{
          transform: 'translate3d(-9999px, -9999px, 0)',
          willChange: 'transform',
        }}
      >
        <div className="flex items-center gap-2 rounded-lg bg-slate-950/82 px-2.5 py-1 text-xs font-medium text-slate-100 border border-white/15 shadow-md whitespace-nowrap">
          <span className="font-mono-tabular font-semibold text-amber-300">
            {formatAltitudeRu(telemetry.altitudeMeters)}
          </span>
          <span className="text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className={`font-mono-tabular font-semibold ${toneClass}`}>
            {formatTemperatureRu(telemetry.temperatureC)}
          </span>
        </div>
      </div>

      {/* Top-Left Compact Telemetry Card */}
      <aside
        aria-label="Показания высоты и температуры"
        className={`fixed top-5 left-5 z-20 w-[min(320px,calc(100vw-2.5rem))] rounded-xl bg-slate-950/86 border border-white/12 p-4 text-slate-100 shadow-lg transition-all duration-300 ${
          zenMode ? 'opacity-0 -translate-y-3 pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="font-display text-base font-bold tracking-tight text-white">
            Восхождение уточки
          </h1>
          <span className="font-mono-tabular text-xs text-slate-400 shrink-0">
            {pct}% пути
          </span>
        </div>

        <p className="mt-1 text-xs text-slate-300 leading-relaxed">
          {telemetry.zoneName}
          <span className="mx-1.5 text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-400">{telemetry.thermalLabel}</span>
        </p>

        {/* Altitude & Temperature Metrics */}
        <div className="mt-3.5 grid grid-cols-2 gap-3 pt-3 border-t border-white/10">
          <div>
            <div className="text-[11px] font-medium text-slate-400">Высота</div>
            <div className="mt-0.5 font-mono-tabular text-xl font-bold text-white leading-tight">
              {formatAltitudeRu(telemetry.altitudeMeters)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">Температура</div>
            <div className={`mt-0.5 font-mono-tabular text-xl font-bold leading-tight ${toneClass}`}>
              {formatTemperatureRu(telemetry.temperatureC)}
            </div>
          </div>
        </div>

        {/* Elevation Zone Progress Bar */}
        <div className="mt-3.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-75"
              style={{
                width: `${pct}%`,
                background:
                  telemetry.altitudeMeters < 1500
                    ? '#84cc16'
                    : telemetry.altitudeMeters < 3000
                      ? '#fbbf24'
                      : '#60a5fa',
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono-tabular text-[10px] text-slate-400">
            <span>0 м</span>
            <span>1500 м</span>
            <span>3000 м</span>
            <span>5000 м</span>
          </div>
        </div>

        {/* Climate details & formula */}
        <div className="mt-3 pt-2.5 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between gap-2">
          <span className="truncate">{telemetry.zoneDescription}</span>
        </div>
        <div className="mt-1 font-mono-tabular text-[10px] text-slate-500">
          15°C − (высота / 1000 × 6,5)
        </div>
      </aside>
    </>
  );
};
