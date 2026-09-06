'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  AudioLines,
  Camera,
  Check,
  ChevronRight,
  Expand,
  Focus,
  LoaderCircle,
  Minus,
  Mouse,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Wind,
} from 'lucide-react';
import ModelNavigation from '@/components/model-navigation';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MikuViewerAPI, MikuView } from '@/lib/miku-scene';
import type { MikuFinish } from '@/lib/miku-character';

export default function MikuViewer() {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLElement>(null);
  const api = useRef<MikuViewerAPI | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState(0);
  const [view, setView] = useState<MikuView | null>('hero'),
    [finish, setFinish] = useState<MikuFinish>('studio');
  const [hair, setHair] = useState(true),
    [wind, setWind] = useState(0.8),
    [reducedMotion, setReducedMotion] = useState(false);
  const [notice, setNotice] = useState(''),
    [saving, setSaving] = useState(false),
    [credits, setCredits] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const element = host.current!;
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const onPreference = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      setHair(enabled);
      setReducedMotion(!enabled);
    };
    element.addEventListener('miku-motion-preference', onPreference);
    import('@/lib/miku-scene')
      .then(({ createMikuScene }) => {
        if (cancelled) return;
        setReducedMotion(reduced);
        setHair(!reduced);
        api.current = createMikuScene(element, {
          onReady: () => setReady(true),
          onError: setError,
          onProgress: setProgress,
          onInteract: () => setView(null),
        });
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'The 3D viewer could not start. Enable hardware acceleration, then reload.',
          );
      });
    return () => {
      cancelled = true;
      element.removeEventListener('miku-motion-preference', onPreference);
      api.current?.dispose();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  const changeView = (value: MikuView) => {
    setView(value);
    api.current?.setView(value);
  };
  const snapshot = async () => {
    setSaving(true);
    try {
      await api.current?.snapshot();
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
    <main className="workshop miku-workshop">
      <header className="topbar">
        <div className="brand">
          <AudioLines size={24} strokeWidth={1.5} />
          <span>
            CHARACTER<span className="brand-divider">/</span>
            <span className="brand-sub">STUDIO</span>
          </span>
        </div>
        <ModelNavigation active="miku" />
        <a
          href="https://project-diva.fandom.com/wiki/Hatsune_Miku"
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
          className="stage miku-stage"
          aria-label="Hatsune Miku 3D viewer"
        >
          <div className="stage-heading">
            <span className="status-dot" />
            <span>CLASSIC MIKU</span>
            <span className="stage-separator">/</span>
            <span className="subtle">初音ミク</span>
          </div>
          <div className="stage-corner">
            <span className="live-indicator" />
            {ready ? 'LIVE 3D' : 'LOADING'}
          </div>
          <div ref={host} className="canvas-host" />
          {(!ready || error) && (
            <output className="loading-state miku-loading" aria-live="polite">
              {error ? (
                <>
                  <p>{error}</p>
                  <button onClick={() => window.location.reload()}>
                    Reload viewer
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle className="spin" size={26} />
                  <p>
                    Preparing Hatsune Miku{' '}
                    <span className="load-percent">{progress}%</span>
                  </p>
                </>
              )}
            </output>
          )}
          <div className="miku-view-caption" aria-live="polite">
            {view === 'face'
              ? 'Face & headset'
              : view === 'outfit'
                ? 'Classic outfit'
                : view === 'back'
                  ? 'Twin-tail detail'
                  : ''}
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
                    ['hero', '3/4'],
                    ['front', 'Front'],
                    ['back', 'Back'],
                  ] as [MikuView, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    disabled={!ready || !!error}
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
                disabled={!ready || !!error}
                onClick={() => api.current?.zoom(1.18)}
              >
                <Minus size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={!ready || !!error}
                onClick={() => api.current?.zoom(0.84)}
              >
                <Plus size={17} />
              </button>
              <span className="toolbar-divider" />
              <button
                className="icon-button"
                aria-label="Reset camera"
                title="Reset camera"
                disabled={!ready || !!error}
                onClick={() => changeView('hero')}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Full screen"
                title="Full screen"
                onClick={fullscreen}
              >
                <Expand size={16} />
              </button>
            </div>
            <div className="stage-meta">
              <span>CHARACTER VOCAL SERIES 01</span>
              <span>
                {hair && !reducedMotion
                  ? 'REACTS TO YOUR TURN'
                  : 'STILL PORTRAIT'}
              </span>
            </div>
          </div>
        </section>
        <aside className="inspector miku-inspector" aria-label="Miku controls">
          <div className="weapon-heading miku-heading">
            <div className="eyebrow">
              VIRTUAL SINGER <span className="miku-japanese">初音ミク</span>
            </div>
            <h1>
              HATSUNE
              <br />
              <span>MIKU</span>
            </h1>
            <p>
              The unmistakable twin-tails.
              <br />
              The classic silver and teal.
            </p>
            <div className="weapon-tags">
              <span>Classic outfit</span>
              <span>Animated hair</span>
            </div>
          </div>
          <section className="settings-section">
            <div className="section-heading">
              <h2>Finish</h2>
              <SlidersHorizontal size={16} />
            </div>
            <Tabs
              value={finish}
              onValueChange={(value) => {
                setFinish(value as MikuFinish);
                api.current?.setFinish(value as MikuFinish);
              }}
            >
              <TabsList className="finish-tabs">
                <TabsTrigger value="studio" disabled={!ready || !!error}>
                  Studio
                </TabsTrigger>
                <TabsTrigger value="toon" disabled={!ready || !!error}>
                  Cel shaded
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="setting-note">
              {finish === 'studio'
                ? 'Soft light, satin hair, brushed silver.'
                : 'Defined shadows and classic anime color.'}
            </p>
          </section>
          <section className="settings-section">
            <div className="section-heading">
              <h2>Hair motion</h2>
              <Wind size={17} />
            </div>
            <label className="toggle-row" htmlFor="miku-hair">
              <span>Flowing twin-tails</span>
              <Switch
                id="miku-hair"
                checked={hair}
                disabled={!ready || !!error || reducedMotion}
                onCheckedChange={(value) => {
                  setHair(value);
                  api.current?.setHair(value);
                }}
                aria-label="Flowing twin-tails"
              />
            </label>
            <div className="miku-wind-label">
              <span id="wind-label">Breeze</span>
              <span>
                {wind === 0
                  ? 'Still air'
                  : wind < 0.5
                    ? 'Light'
                    : wind < 1.15
                      ? 'Gentle'
                      : 'Lively'}
              </span>
            </div>
            <Slider
              value={[wind]}
              min={0}
              max={1.6}
              step={0.05}
              disabled={!ready || !!error || !hair || reducedMotion}
              onValueChange={(value) => {
                const v = Array.isArray(value) ? value[0] : value;
                setWind(v);
                api.current?.setWind(v);
              }}
              aria-labelledby="wind-label"
            />
            <p className="setting-note">
              {reducedMotion
                ? 'Motion is paused to match your device preference.'
                : 'Drag to turn. Her hair swings and settles.'}
            </p>
          </section>
          <section className="settings-section miku-details">
            <div className="section-heading">
              <h2>A closer look</h2>
              <Focus size={17} />
            </div>
            <div className="parts-list">
              {(
                [
                  [
                    'face',
                    'Face & headset',
                    'Eyes, fringe and signature hair clips',
                  ],
                  [
                    'outfit',
                    'Classic outfit',
                    'Silver vest, tie and sleeve controls',
                  ],
                  [
                    'back',
                    'Twin-tails',
                    'Long strands, flowing from the clips',
                  ],
                ] as [MikuView, string, string][]
              ).map(([value, title, detail]) => (
                <button
                  key={value}
                  disabled={!ready || !!error}
                  className={view === value ? 'selected' : ''}
                  aria-pressed={view === value}
                  onClick={() => changeView(value)}
                >
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
          </section>
          <div className="inspector-bottom">
            <button
              className="export-button"
              onClick={snapshot}
              disabled={!ready || !!error || saving}
            >
              {saving ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Camera size={17} />
              )}
              Save image<span className="file-type">PNG</span>
            </button>
            <button
              className="about-button"
              aria-expanded={credits}
              onClick={() => setCredits(!credits)}
            >
              Model & credits{' '}
              <ChevronRight size={13} className={credits ? 'turned' : ''} />
            </button>
            {credits && (
              <div className="reference-note">
                Classic mesh by Animasa, refined for this study. Character ©
                Crypton Future Media, INC. Based on the classic MMD model;
                details differ from the Project DIVA references.
                <br />
                <a
                  href="/models/miku/CREDITS.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Full credits & model source <ArrowUpRight size={12} />
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
      {notice && (
        <output className="notice" aria-live="polite">
          <Check size={16} />
          {notice}
        </output>
      )}
    </main>
  );
}
