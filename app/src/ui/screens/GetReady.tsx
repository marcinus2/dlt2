import { Check, Crosshair, LoaderCircle } from 'lucide-react';
import { lazy, Suspense, useId, useState } from 'react';
import { BigButton } from '../components/BigButton.tsx';
import { CameraErrorCard } from '../components/CameraErrorCard.tsx';
import { CameraLayer, useVideoSize } from '../components/CameraLayer.tsx';
import { RoiOverlay } from '../components/RoiOverlay.tsx';
import { SegmentGroup } from '../components/SettingField.tsx';
import { WarnChip } from '../components/StatusChip.tsx';
import { TopBar } from '../components/TopBar.tsx';
import { pct, useCalibration } from '../config/useCalibration.ts';
import { CAMERA_EXPLAINER } from '../copy.ts';
import { useApp } from '../store.tsx';

// Loaded on the first Difference tap; Diagnostics shares the chunk.
const DiffView = lazy(() => import('../debug/DiffView.tsx').then((m) => ({ default: m.DiffView })));

type PreviewMode = 'live' | 'diff';
const PREVIEW_OPTIONS: { value: PreviewMode; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'diff', label: 'Difference' },
];

function HealthLine() {
  const camera = useApp((s) => s.state.camera);
  // Processed fps once frames flow (0 before the first interval); the camera's own rate until then.
  const fps = useApp((s) => s.ui.stats?.fps || s.ui.cameraInfo?.fps || null);
  const facing = useApp((s) => s.ui.cameraInfo?.facing ?? s.saved.camera.facing);
  const lowFps = useApp((s) => s.ui.lowFps);

  if (camera === 'starting' || camera === 'off') {
    return (
      <div className="flex max-w-[420px] flex-col items-center gap-1 text-center">
        <p className="inline-flex items-center gap-2 font-semibold text-text">
          <LoaderCircle aria-hidden size={18} className="animate-spin motion-reduce:animate-none" />
          Starting camera…
        </p>
        <p className="text-sm text-text-muted">{CAMERA_EXPLAINER}</p>
      </div>
    );
  }
  if (camera !== 'live') return null;
  if (lowFps) return <WarnChip>Low frame rate — passes may be missed</WarnChip>;
  return (
    <p data-testid="camera-health" className="inline-flex min-h-9 items-center gap-2 font-semibold text-text">
      <Check aria-hidden size={18} strokeWidth={3} className="text-best" />
      {fps === null ? '' : `${Math.round(fps)} fps · `}
      {facing === 'environment' ? 'rear camera' : 'front camera'}
    </p>
  );
}

/** Diff canvas of the processed region (saved threshold); a placeholder in sim, which has no analyzer. */
function DiffPreview({ mirrored }: { mirrored: boolean }) {
  const onSample = useApp((s) => s.onSample);
  const luma = useApp((s) => s.luma);
  const threshold = useApp((s) => s.saved.detection.pixelDiffThreshold);
  const [drawn, setDrawn] = useState(false);
  return (
    <div className="relative order-1 flex min-h-32 w-full flex-1 basis-0 flex-col items-center justify-center gap-2 overflow-hidden">
      {luma() === null ? (
        <p className="rounded-card border border-border bg-surface-2 p-4 text-center text-text-muted">
          Difference view needs the real camera.
        </p>
      ) : (
        <>
          <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-card border border-border bg-surface-2">
            {!drawn && <p className="text-sm text-text-muted">Waiting for frames…</p>}
            <Suspense fallback={null}>
              <DiffView
                subscribe={onSample}
                luma={luma}
                threshold={threshold}
                mirrored={mirrored}
                onDrawn={() => setDrawn(true)}
                className="absolute inset-0 size-full object-contain"
              />
            </Suspense>
          </div>
          <p className="text-center text-sm text-text-muted">
            Highlighted: pixels that changed. Only the detection region is shown.
          </p>
        </>
      )}
    </div>
  );
}

type Calibration = ReturnType<typeof useCalibration>;

/** Preview toggle + Calibrate (portrait: under the health line; landscape: above START). */
function PreviewControls({
  mode,
  onMode,
  live,
  cal,
}: {
  mode: PreviewMode;
  onMode: (m: PreviewMode) => void;
  live: boolean;
  cal: Calibration;
}) {
  const labelId = useId();
  return (
    <div className="order-3 flex flex-wrap items-center justify-center gap-2">
      <span id={labelId} className="sr-only">
        Preview
      </span>
      <SegmentGroup
        options={PREVIEW_OPTIONS}
        value={mode}
        onSelect={onMode}
        labelId={labelId}
        disabled={!live}
        className="flex-nowrap"
      />
      <button
        type="button"
        disabled={!live}
        onClick={cal.toggle}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-accent px-4 font-semibold text-accent disabled:opacity-40"
      >
        <Crosshair aria-hidden size={18} />
        {cal.running ? 'Cancel' : 'Calibrate'}
      </button>
    </div>
  );
}

/** One fixed-height slot for the hint, progress and outcome, so the preview never resizes. */
function CalibrationStatus({ cal, durationMs }: { cal: Calibration; durationMs: number }) {
  const { running, outcome, progress } = cal;
  return (
    <div
      role="status"
      className="order-4 flex min-h-18 w-full max-w-[480px] flex-col justify-center gap-1 text-center"
    >
      {running ? (
        <>
          <p className="font-semibold text-text">Calibrating — keep the scene still…</p>
          <div className="h-2 rounded-full bg-surface-2">
            <div ref={progress} className="h-full origin-left scale-x-0 rounded-full bg-accent" />
          </div>
        </>
      ) : outcome?.kind === 'failed' ? (
        <p className="font-semibold text-warn">Calibration failed: no usable frames. Try again.</p>
      ) : outcome?.kind === 'done' ? (
        <div data-testid="calibration-result">
          <p className="font-semibold text-text">
            Calibrated and saved: start <span className="font-mono">{pct(outcome.c.startRatio)}</span> · end{' '}
            <span className="font-mono">{pct(outcome.c.endRatio)}</span>.
          </p>
          {outcome.c.hint && (
            <p className="text-sm font-semibold text-warn">
              Idle noise is high: check the lighting, exposure and region.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-text-muted">
          Keep the scene empty for {+(durationMs / 1000).toFixed(1)} s.
        </p>
      )}
    </div>
  );
}

/**
 * Get Ready (spec §3.1): Live (ROI overlay + pass flash) or Difference preview, health line,
 * Calibrate on the saved settings (saved and applied at once, no Save), START.
 * Portrait is one column (the two wrappers are `display: contents`, `order-*` sets the sequence);
 * landscape puts preview, health and status left, controls and START right.
 */
export function GetReady() {
  const camera = useApp((s) => s.state.camera);
  const dispatch = useApp((s) => s.dispatch);
  const roi = useApp((s) => s.saved.detection.roi);
  const flash = useApp((s) => s.ui.passFlash);
  const facing = useApp((s) => s.ui.cameraInfo?.facing ?? s.saved.camera.facing);
  const width = useApp((s) => s.ui.cameraInfo?.width ?? s.saved.camera.width);
  const height = useApp((s) => s.ui.cameraInfo?.height ?? s.saved.camera.height);
  const calSettings = useApp((s) => s.saved.calibration);
  const applyCalibration = useApp((s) => s.applyCalibration);
  const failCalibration = useApp((s) => s.failCalibration);
  const error = typeof camera === 'object' ? camera.error : null;
  const live = camera === 'live';
  const frame = useVideoSize();
  const aspect = frame ? frame.width / frame.height : width / height;
  const [mode, setMode] = useState<PreviewMode>('live');
  const cal = useCalibration({
    live,
    durationMs: calSettings.durationMs,
    k: calSettings.k,
    onResult: applyCalibration,
    onFail: failCalibration,
  });

  return (
    <>
      <TopBar />
      <main className="mx-auto flex min-h-0 w-full max-w-[480px] flex-1 flex-col items-center gap-3 px-safe py-4 landscape:max-w-[1040px] landscape:flex-row landscape:justify-center landscape:gap-8 landscape:py-3">
        <div className="contents landscape:flex landscape:min-h-0 landscape:w-full landscape:max-w-[640px] landscape:flex-1 landscape:flex-col landscape:items-center landscape:justify-center landscape:gap-2 landscape:self-stretch">
          {error ? (
            <div className="order-1">
              <CameraErrorCard error={error} onRetry={() => dispatch({ type: 'RETRY' })} />
            </div>
          ) : mode === 'diff' ? (
            <DiffPreview mirrored={facing === 'user'} />
          ) : (
            <div className="order-1 flex min-h-32 w-full flex-1 basis-0 items-center justify-center overflow-hidden">
              <CameraLayer mirrored={facing === 'user'} aspect={aspect} fit>
                <RoiOverlay roi={roi} flash={flash} frame={frame} />
              </CameraLayer>
            </div>
          )}
          <div className="order-2">
            <HealthLine />
          </div>
          <CalibrationStatus cal={cal} durationMs={calSettings.durationMs} />
        </div>
        <div className="contents landscape:flex landscape:flex-col landscape:items-center landscape:justify-center landscape:gap-4">
          <PreviewControls mode={mode} onMode={setMode} live={live} cal={cal} />
          {error?.kind !== 'notFound' && (
            <div className="order-5">
              <BigButton
                label="Start"
                tone="danger"
                size="compact"
                disabled={!live}
                onPress={() => dispatch({ type: 'START' })}
              />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
