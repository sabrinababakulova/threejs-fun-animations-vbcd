'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  ChevronRight,
  Expand,
  LoaderCircle,
  Minus,
  Mouse,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Waves,
} from 'lucide-react';
import ModelNavigation from '@/components/model-navigation';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  angularVelocity,
  coreRadius,
  initialPlayback,
  singularityScales,
  DEFAULT_VISCOSITY,
  MIN_VISCOSITY,
  MAX_VISCOSITY,
  COLLAPSE_LIMIT,
} from '@/lib/navier-stokes-flow';
import type { SwirlAPI, SwirlView } from '@/lib/navier-stokes-scene';

const ARTICLE = 'https://openai.com/index/navier-stokes-solution/';
const PAPER =
  'https://cdn.openai.com/pdf/32d9f210-8b73-45e0-91bc-82a30aef8a9a/navier-stokes.pdf';

export default function NavierStokesViewer() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const api = useRef<SwirlAPI | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState(initialPlayback(false));
  const [viscosity, setViscosity] = useState(DEFAULT_VISCOSITY);
  const [view, setView] = useState<SwirlView | null>('perspective');
  const [guides, setGuides] = useState(true);
  const [references, setReferences] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onPreference = () => setReducedMotion(preference.matches);
    onPreference();
    preference.addEventListener('change', onPreference);
    import('@/lib/navier-stokes-scene')
      .then(({ createSwirlScene }) => {
        if (cancelled) return;
        api.current = createSwirlScene(host.current!, {
          onState: setPlayback,
          onInteract: () => setView(null),
          onError: setError,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'The 3D viewer could not start. Enable hardware acceleration, then reload.',
          );
      });
    return () => {
      cancelled = true;
      preference.removeEventListener('change', onPreference);
      api.current?.dispose();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);
  const unavailable = !ready || !!error;
  const scales = singularityScales(
    playback.singularity ? playback.progress : 0,
  );
  const finished = playback.singularity && playback.progress >= COLLAPSE_LIMIT;
  const changeView = (value: SwirlView) => {
    setView(value);
    api.current?.setView(value);
  };
  const reset = () => {
    api.current?.reset();
    setViscosity(DEFAULT_VISCOSITY);
    setView('perspective');
    setGuides(true);
  };
  const snapshot = async () => {
    if (!api.current) return;
    setSaving(true);
    try {
      await api.current.snapshot();
      setNotice('Image saved');
    } catch {
      setNotice('Could not save the image. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage.current?.requestFullscreen();
    } catch {
      setNotice('Full screen is unavailable in this browser.');
    }
  };
  return (
    <main className="workshop swirl-workshop">
      <header className="topbar">
        <div className="brand">
          <Waves size={24} strokeWidth={1.5} />
          <span>
            FLOW<span className="brand-divider">/</span>
            <span className="brand-sub">STUDIO</span>
          </span>
        </div>
        <ModelNavigation active="navier-stokes" />
        <a
          href={ARTICLE}
          target="_blank"
          rel="noreferrer"
          className="reference-link"
        >
          Source reference <ArrowUpRight size={15} />
        </a>
      </header>
      <div className="workspace">
        <section
          ref={stage}
          className="stage swirl-stage"
          aria-label="Navier–Stokes 3D vortex viewer"
        >
          <div className="stage-heading">
            <span className="status-dot" />
            <span>VORTEX STUDY</span>
          </div>
          <div className="stage-corner">
            <span className="live-indicator" />
            {error
              ? 'UNAVAILABLE'
              : !ready
                ? 'LOADING'
                : playback.playing
                  ? 'LIVE FLOW'
                  : 'PAUSED'}
          </div>
          <div ref={host} className="canvas-host" />
          {(!ready || error) && (
            <output className="loading-state swirl-loading" aria-live="polite">
              {error ? (
                <>
                  <p>{error}</p>
                  <button onClick={() => window.location.reload()}>
                    Reload viewer
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle className="spin" size={25} />
                  <p>Tracing the vortex</p>
                </>
              )}
            </output>
          )}
          {guides &&
            !playback.singularity &&
            view !== 'top' &&
            view !== null && (
              <div className="swirl-annotations" aria-hidden="true">
                <span className="swirl-inward">
                  Inward spiral<small>Radial inflow</small>
                </span>
                <span className="swirl-axial">
                  Axial stretching<small>Outward along the axis</small>
                </span>
              </div>
            )}
          {playback.singularity && (
            <div className="swirl-collapse-caption">
              <span>
                {finished
                  ? 'Display limit reached'
                  : 'Approaching the singularity'}
              </span>
              <small>t / T = {playback.progress.toFixed(3)} · schematic</small>
            </div>
          )}
          <div
            className="swirl-legend"
            aria-label="Strand color shows relative angular rotation, from slower teal to faster orange"
          >
            <span>ANGULAR ROTATION</span>
            <div className="swirl-color-scale" />
            <div>
              <span>Slower</span>
              <span>Faster</span>
            </div>
          </div>
          <div className="stage-footer">
            <div className="interaction-hint">
              <Mouse size={15} />
              <span>Drag to orbit</span>
              <span className="hint-dot">·</span>
              <span>Scroll to zoom</span>
            </div>
            <div className="viewer-toolbar">
              <div className="camera-presets" aria-label="Camera views">
                {(
                  [
                    ['perspective', '3/4'],
                    ['front', 'Front'],
                    ['top', 'Top'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    disabled={unavailable}
                    aria-pressed={view === value}
                    className={view === value ? 'active' : ''}
                    onClick={() => changeView(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="toolbar-divider" />
              <button
                className="icon-button"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={unavailable}
                onClick={() => api.current?.zoom(1.18)}
              >
                <Minus size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={unavailable}
                onClick={() => api.current?.zoom(0.84)}
              >
                <Plus size={17} />
              </button>
              <span className="toolbar-divider" />
              <button
                className="icon-button"
                aria-label="Reset camera"
                title="Reset camera"
                disabled={unavailable}
                onClick={() => changeView('perspective')}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Toggle full screen"
                title="Full screen"
                disabled={unavailable}
                onClick={fullscreen}
              >
                <Expand size={16} />
              </button>
            </div>
            <div className="stage-meta">
              <span>84 FLOW TRAJECTORIES</span>
              <span>THREE.JS / 3D</span>
            </div>
          </div>
        </section>
        <aside
          className="inspector swirl-inspector"
          aria-label="Vortex controls"
        >
          <div className="weapon-heading swirl-heading">
            <div className="eyebrow">FLUID DYNAMICS</div>
            <h1>
              NAVIER–STOKES
              <br />
              <span>SWIRL</span>
            </h1>
            <p>
              Inward motion. Outward stretch.
              <br />A vortex in constant circulation.
            </p>
          </div>
          <section className="settings-section swirl-flow-controls">
            <div className="section-heading">
              <h2>Flow controls</h2>
              <SlidersHorizontal size={16} />
            </div>
            <div className="swirl-range-heading">
              <span id="swirl-viscosity-label">
                Viscosity <span className="swirl-symbol">ν</span>
              </span>
              <output>{viscosity.toFixed(3)}</output>
            </div>
            <Slider
              aria-labelledby="swirl-viscosity-label"
              aria-describedby="swirl-viscosity-note"
              min={MIN_VISCOSITY}
              max={MAX_VISCOSITY}
              step={0.005}
              value={[viscosity]}
              disabled={unavailable}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value;
                setViscosity(v);
                api.current?.setViscosity(v);
              }}
            />
            <div className="swirl-range-endpoints">
              <span>Less viscous</span>
              <span>More viscous</span>
            </div>
            <p className="setting-note" id="swirl-viscosity-note">
              Higher viscosity spreads the core and softens its rotation. Values
              use relative units.
            </p>
            <div className="swirl-range-heading swirl-speed-heading">
              <span id="swirl-speed-label">Playback speed</span>
              <output>{playback.speed.toFixed(2).replace(/0$/, '')}×</output>
            </div>
            <Slider
              aria-labelledby="swirl-speed-label"
              min={0.25}
              max={3}
              step={0.25}
              value={[playback.speed]}
              disabled={unavailable}
              onValueChange={(value) =>
                api.current?.setSpeed(Array.isArray(value) ? value[0] : value)
              }
            />
            <div className="swirl-range-endpoints">
              <span>0.25×</span>
              <span>3×</span>
            </div>
            <div className="swirl-playback-buttons">
              <button
                className="swirl-play"
                disabled={unavailable}
                onClick={() => api.current?.setPlaying(!playback.playing)}
              >
                {playback.playing ? (
                  <Pause size={16} />
                ) : finished ? (
                  <RotateCcw size={16} />
                ) : (
                  <Play size={16} />
                )}
                {playback.playing
                  ? 'Pause flow'
                  : finished
                    ? 'Replay collapse'
                    : 'Play flow'}
              </button>
              <button
                className="swirl-reset"
                disabled={unavailable}
                onClick={reset}
                title="Reset all controls"
                aria-label="Reset all controls"
              >
                <RotateCcw size={16} />
              </button>
            </div>
            {reducedMotion && !playback.playing && (
              <p className="setting-note">
                Motion is paused for your device preference. Press play to
                animate.
              </p>
            )}
          </section>
          <section className="settings-section swirl-singularity-controls">
            <label className="toggle-row" htmlFor="swirl-singularity">
              <span>Singularity</span>
              <Switch
                id="swirl-singularity"
                checked={playback.singularity}
                disabled={unavailable}
                onCheckedChange={(value) => api.current?.setSingularity(value)}
              />
            </label>
            <p className="setting-note">
              Explore a shrinking, accelerating core as time approaches the
              singularity.
            </p>
            {playback.singularity && (
              <div className="swirl-timeline">
                <div className="swirl-range-heading">
                  <span id="swirl-time-label">Time toward collapse</span>
                  <output aria-live="off">
                    {(playback.progress * 100).toFixed(1)}%
                  </output>
                </div>
                <Slider
                  aria-labelledby="swirl-time-label"
                  min={0}
                  max={COLLAPSE_LIMIT}
                  step={0.001}
                  value={[playback.progress]}
                  disabled={unavailable}
                  onValueChange={(value) =>
                    api.current?.seek(Array.isArray(value) ? value[0] : value)
                  }
                />
                <div className="swirl-range-endpoints">
                  <span>Initial flow</span>
                  <span>99% limit</span>
                </div>
                <p className="setting-note">
                  Scrub to pause and inspect. The display stops before infinite
                  values.
                </p>
              </div>
            )}
            <dl className="swirl-readouts">
              <div>
                <dt>Core radius</dt>
                <dd>{(coreRadius(viscosity) * scales.radial).toFixed(3)}</dd>
              </div>
              <div>
                <dt>Peak angular rate</dt>
                <dd>
                  {(angularVelocity(0, viscosity) * scales.angular).toFixed(1)}
                  <small> rad / t</small>
                </dd>
              </div>
            </dl>
          </section>
          <section className="settings-section swirl-guide-controls">
            <label className="toggle-row" htmlFor="swirl-guides">
              <span>Flow guides</span>
              <Switch
                id="swirl-guides"
                checked={guides}
                disabled={unavailable}
                onCheckedChange={(value) => {
                  setGuides(value);
                  api.current?.setGuides(value);
                }}
              />
            </label>
          </section>
          <div className="inspector-bottom">
            <button
              className="export-button"
              disabled={unavailable || saving}
              onClick={snapshot}
            >
              {saving ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Camera size={17} />
              )}
              Save image<span className="file-type">PNG</span>
            </button>
            <p className="swirl-model-note">
              Analytic vortex visualization. Singularity mode illustrates
              scaling, not a numerical solution of the full proof.
            </p>
            <button
              className="about-button"
              aria-expanded={references}
              onClick={() => setReferences(!references)}
            >
              Model & references{' '}
              <ChevronRight size={13} className={references ? 'turned' : ''} />
            </button>
            {references && (
              <div className="reference-note swirl-references">
                <p>
                  Normal flow uses a Burgers vortex: radial inflow balanced by
                  axial stretching and viscosity. Color shows angular rotation
                  relative to the current peak; it is not a speed magnitude map.
                </p>
                <p>
                  The collapse schematic uses the paper’s radial and axial scale
                  exponents with h = 0.005. Both dimensions shrink; the radius
                  shrinks faster. The trajectory shape remains a Burgers
                  approximation.
                </p>
                <a href={ARTICLE} target="_blank" rel="noreferrer">
                  OpenAI · Article & visual reference <ArrowUpRight size={12} />
                </a>
                <a href={PAPER} target="_blank" rel="noreferrer">
                  Read the paper · §2 <ArrowUpRight size={12} />
                </a>
                <a
                  href="https://arxiv.org/abs/1002.2489"
                  target="_blank"
                  rel="noreferrer"
                >
                  Gallay & Maekawa · Burgers vortices <ArrowUpRight size={12} />
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
      {notice && (
        <output className="notice" aria-live="polite">
          {notice}
        </output>
      )}
    </main>
  );
}
