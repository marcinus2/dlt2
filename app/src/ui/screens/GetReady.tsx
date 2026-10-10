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
  return (
    <div className="relative flex min-h-40 w-full flex-1 basis-0 flex-col items-center justify-center gap-2 overflow-hidden">
      {luma() === null ? (
        <p className="rounded-card border border-border bg-surface-2 p-4 text-center text-text-muted">
          Difference view needs the real camera.
        </p>
      ) : (
        <>
          <div className="relative w-full flex-1 overflow-hidden rounded-card border border-border bg-surface-2">
            <Suspense fallback={null}>
              <DiffView
                subscribe={onSample}
                luma={luma}
                threshold={threshold}
                mirrored={mirrored}
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

/** Preview toggle + Calibrate on the saved settings: the result is saved and applied at once (no Save). */
function PreviewControls({ mode, onMode }: { mode: PreviewMode; onMode: (m: PreviewMode) => void }) {
  const live = useApp((s) => s.state.camera === 'live');
  const cal = useApp((s) => s.saved.calibration);
  const applyCalibration = useApp((s) => s.applyCalibration);
  const { running, outcome, progress, toggle } = useCalibration({
    live,
    durationMs: cal.durationMs,
    k: cal.k,
    onResult: applyCalibration,
  });
  const labelId = useId();
  return (
    <div className="flex w-full max-w-[480px] flex-col gap-2">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <span id={labelId} className="text-sm font-semibold text-text-muted">
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
          onClick={toggle}
          className="inline-flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-full border border-accent px-5 font-semibold text-accent disabled:opacity-40"
        >
          <Crosshair aria-hidden size={18} />
          {running ? 'Cancel' : 'Calibrate'}
        </button>
      </div>
      <p className="text-center text-sm text-text-muted">
        Keep the scene empty for {+(cal.durationMs / 1000).toFixed(1)} s.
      </p>
      {running && (
        <div role="status" className="flex flex-col gap-1">
          <p className="font-semibold text-text">Calibrating — keep the scene still…</p>
          <div className="h-2 rounded-full bg-surface-2">
            <div ref={progress} className="h-full origin-left scale-x-0 rounded-full bg-accent" />
          </div>
        </div>
      )}
      {outcome?.kind === 'failed' && (
        <p role="status" className="font-semibold text-warn">
          Calibration failed: no usable frames. Try again.
        </p>
      )}
      {outcome?.kind === 'done' && (
        <div role="status" data-testid="calibration-result" className="text-sm">
          <p className="font-semibold text-text">
            Calibrated and saved: start {pct(outcome.c.startRatio)} · end {pct(outcome.c.endRatio)}.
          </p>
          {outcome.c.hint && (
            <p className="font-semibold text-warn">
              Idle noise is high: check the lighting, exposure and region.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Get Ready (spec §3.1): Live (ROI overlay + pass flash) or Difference preview, health line,
 * Calibrate on the saved settings, START.
 */
export function GetReady() {
  const camera = useApp((s) => s.state.camera);
  const dispatch = useApp((s) => s.dispatch);
  const roi = useApp((s) => s.saved.detection.roi);
  const flash = useApp((s) => s.ui.passFlash);
  const facing = useApp((s) => s.ui.cameraInfo?.facing ?? s.saved.camera.facing);
  const width = useApp((s) => s.ui.cameraInfo?.width ?? s.saved.camera.width);
  const height = useApp((s) => s.ui.cameraInfo?.height ?? s.saved.camera.height);
  const error = typeof camera === 'object' ? camera.error : null;
  const frame = useVideoSize();
  const aspect = frame ? frame.width / frame.height : width / height;
  const [mode, setMode] = useState<PreviewMode>('live');

  return (
    <>
      <TopBar />
      <main className="mx-auto flex min-h-0 w-full max-w-[480px] flex-1 flex-col items-center gap-4 px-safe py-4 landscape:max-w-[1040px] landscape:flex-row landscape:justify-center landscape:gap-8">
        <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-3 landscape:max-w-[640px] landscape:self-stretch">
          {error ? (
            <CameraErrorCard error={error} onRetry={() => dispatch({ type: 'RETRY' })} />
          ) : mode === 'diff' ? (
            <DiffPreview mirrored={facing === 'user'} />
          ) : (
            <div className="flex min-h-40 w-full flex-1 basis-0 items-center justify-center overflow-hidden">
              <CameraLayer mirrored={facing === 'user'} aspect={aspect} fit>
                <RoiOverlay roi={roi} flash={flash} frame={frame} />
              </CameraLayer>
            </div>
          )}
          <HealthLine />
          <PreviewControls mode={mode} onMode={setMode} />
        </div>
        {error?.kind !== 'notFound' && (
          <BigButton
            label="Start"
            tone="danger"
            size="compact"
            disabled={camera !== 'live'}
            onPress={() => dispatch({ type: 'START' })}
          />
        )}
      </main>
    </>
  );
}
