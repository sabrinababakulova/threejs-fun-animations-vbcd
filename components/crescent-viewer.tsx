'use client';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  ArrowDownToLine,
  ArrowUpRight,
  Box,
  Check,
  ChevronRight,
  Crosshair,
  Expand,
  Focus,
  Grid2X2,
  LoaderCircle,
  Minus,
  Mouse,
  Plus,
  RotateCcw,
  ScanLine,
  Camera,
  X,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CameraView, ViewerAPI } from '@/lib/viewer-scene';
import type { Finish, PartName } from '@/lib/crescent-rose';

const parts: { id: PartName; name: string; description: string }[] = [
  {
    id: 'blade',
    name: 'Crescent blade',
    description:
      'The sweeping silver cutting edge sits inside a red articulated frame. A circular joint connects the lower arm to the hooked black tip.',
  },
  {
    id: 'counterblade',
    name: 'Counterblade & pivot',
    description:
      'A smaller reverse blade sits above the main hinge, with a red cap and an exposed folding joint.',
  },
  {
    id: 'receiver',
    name: 'Rifle receiver',
    description:
      'The rifle assembly includes the scope, bolt handle, angular magazine, and the red receiver housing.',
  },
  {
    id: 'shaft',
    name: 'Telescoping shaft',
    description:
      'Black sliding segments connect the rifle body to the head. Red frame rails and recessed barrel details follow the production reference.',
  },
  {
    id: 'pommel',
    name: 'Bladed pommel',
    description:
      'The narrow black-and-red shaft ends in a split silver-edged spike, held by a small circular pivot.',
  },
];
export default function CrescentViewer() {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<ViewerAPI | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const [finish, setFinish] = useState<Finish>('studio'),
    [view, setView] = useState<CameraView | null>('hero');
  const [rotate, setRotate] = useState(false),
    [grid, setGrid] = useState(true),
    [explode, setExplode] = useState(0);
  const [part, setPart] = useState<PartName | null>(null),
    [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(''),
    [reference, setReference] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const element = host.current!;
    const onError = (event: Event) =>
      setError((event as CustomEvent<string>).detail);
    element.addEventListener('viewer-error', onError);
    import('@/lib/viewer-scene')
      .then(({ createViewerScene }) => {
        if (cancelled) return;
        try {
          api.current = createViewerScene(element, () => {
            setRotate(false);
            setPart(null);
            setView(null);
          });
          setReady(true);
        } catch (e) {
          setError(
            'The 3D viewer needs WebGL 2. Enable hardware acceleration in your browser, then reload.',
          );
          console.error(e);
        }
      })
      .catch(() =>
        setError('The 3D viewer could not load. Reload to try again.'),
      );
    return () => {
      cancelled = true;
      element.removeEventListener('viewer-error', onError);
      api.current?.dispose();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timeout);
  }, [notice]);
  const inspectFromAgent = useEffectEvent((input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('Expected an object.');
    const values = input as Record<string, unknown>;
    if (Object.keys(values).some((key) => !['part', 'finish'].includes(key)))
      throw new Error('Unknown setting.');
    const target = values.part ?? 'whole',
      surface = values.finish ?? finish;
    if (target !== 'whole' && !parts.some((p) => p.id === target))
      throw new Error('Unknown model part.');
    if (!['studio', 'original', 'wireframe'].includes(surface as string))
      throw new Error('Unknown surface.');
    if (!api.current) throw new Error('The model is still loading.');
    flushSync(() => {
      setFinish(surface as Finish);
      api.current!.setFinish(surface as Finish);
      setRotate(false);
      api.current!.setAutoRotate(false);
      if (target === 'whole') {
        setPart(null);
        setView('hero');
        api.current!.setView('hero', false);
      } else {
        setPart(target as PartName);
        api.current!.focusPart(target as PartName, false);
      }
    });
    return { part: target, finish: surface, status: 'displayed' };
  });
  useEffect(() => {
    if (!ready) return;
    type ToolContext = {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: object;
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const context = (document as Document & { modelContext?: ToolContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'inspect_crescent_rose',
            title: 'Inspect Crescent Rose',
            description:
              'Display the full scythe or focus a named assembly, and optionally change its surface. Updates the visible 3D viewer.',
            inputSchema: {
              type: 'object',
              properties: {
                part: {
                  type: 'string',
                  enum: ['whole', ...parts.map((p) => p.id)],
                },
                finish: {
                  type: 'string',
                  enum: ['studio', 'original', 'wireframe'],
                },
              },
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: (input) => inspectFromAgent(input),
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {
        /* Optional browser capability. */
      });
    } catch {
      /* Browsers without the proposed API keep the standard controls. */
    }
    return () => lifecycle.abort();
  }, [ready]);
  const changeView = (next: CameraView) => {
    setView(next);
    setPart(null);
    api.current?.setView(next);
  };
  const reset = () => {
    setRotate(false);
    setExplode(0);
    setPart(null);
    api.current?.setAutoRotate(false);
    api.current?.setExplode(0);
    changeView('hero');
  };
  const exportModel = async () => {
    setExporting(true);
    try {
      await api.current?.exportGLB();
      setNotice('3D model exported');
    } catch {
      setNotice('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };
  const selected = parts.find((p) => p.id === part);
  return (
    <main className="workshop">
      <header className="topbar">
        <div className="brand">
          <Box size={23} strokeWidth={1.4} />
          <span>
            REMNANT<span className="brand-divider">/</span>
            <span className="brand-sub">ARMORY</span>
          </span>
        </div>
        <div className="topbar-center">
          RWBY <span>·</span> WEAPON STUDY
        </div>
        <a
          href="https://rwby.fandom.com/wiki/Crescent_Rose"
          target="_blank"
          rel="noreferrer"
          className="reference-link"
        >
          Source reference <ArrowUpRight size={15} />
        </a>
      </header>
      <div className="workspace">
        <section className="stage" aria-label="3D model viewer">
          <div className="stage-heading">
            <span className="status-dot" />
            <span>SCYTHE FORM</span>
            <span className="stage-separator">/</span>
            <span className="subtle">FULLY EXTENDED</span>
          </div>
          <div className="stage-corner">
            <span className="live-indicator" />
            {ready ? 'LIVE 3D' : 'LOADING 3D'}
          </div>
          <div ref={host} className="canvas-host" />
          {(!ready || error) && (
            <output className="loading-state" aria-live="polite">
              {error ? (
                <>
                  <p>{error}</p>
                  <button onClick={() => window.location.reload()}>
                    Reload viewer
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle className="spin" />
                  <p>Assembling Crescent Rose</p>
                </>
              )}
            </output>
          )}
          <div className="stage-watermark" aria-hidden="true">
            CRESCENT
            <br />
            ROSE
          </div>
          {selected && (
            <div className="part-caption">
              <div>
                <span className="eyebrow">DETAIL VIEW</span>
                <h2>{selected.name}</h2>
              </div>
              <button
                aria-label="Return to full model"
                onClick={() => changeView('hero')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="stage-footer">
            <div className="interaction-hint">
              <Mouse size={15} />
              <span>Drag to orbit</span>
              <span className="hint-dot">·</span>
              <span>Scroll to zoom</span>
              <span className="hint-dot">·</span>
              <span>Right-drag to pan</span>
            </div>
            <div className="viewer-toolbar">
              <div className="camera-presets" aria-label="Camera views">
                {(
                  [
                    ['hero', '3/4'],
                    ['front', 'Front'],
                    ['back', 'Back'],
                    ['side', 'Profile'],
                  ] as [CameraView, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    disabled={!ready}
                    aria-pressed={view === value && !part}
                    className={view === value && !part ? 'active' : ''}
                    onClick={() => changeView(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="toolbar-divider" />
              <button
                className="icon-button"
                title="Zoom out"
                aria-label="Zoom out"
                disabled={!ready}
                onClick={() => api.current?.zoom(1.2)}
              >
                <Minus size={17} />
              </button>
              <button
                className="icon-button"
                title="Zoom in"
                aria-label="Zoom in"
                disabled={!ready}
                onClick={() => api.current?.zoom(0.8)}
              >
                <Plus size={17} />
              </button>
              <span className="toolbar-divider" />
              <button
                className="icon-button"
                title="Reset view"
                aria-label="Reset view"
                disabled={!ready}
                onClick={reset}
              >
                <RotateCcw size={16} />
              </button>
              <button
                className="icon-button"
                title="Save image"
                aria-label="Save image"
                disabled={!ready}
                onClick={() => {
                  api.current?.screenshot();
                  setNotice('Image saved');
                }}
              >
                <Camera size={17} />
              </button>
              <button
                className="icon-button fullscreen-button"
                title="Fullscreen"
                aria-label="Fullscreen viewer"
                onClick={() => {
                  const stage = host.current?.parentElement;
                  if (document.fullscreenElement)
                    document
                      .exitFullscreen()
                      .catch(() => setNotice('Fullscreen is unavailable'));
                  else
                    stage
                      ?.requestFullscreen()
                      .catch(() => setNotice('Fullscreen is unavailable'));
                }}
              >
                <Expand size={16} />
              </button>
            </div>
            <div className="stage-meta">
              <span>RUBY ROSE’S SIGNATURE WEAPON</span>
              <span>THREE.JS</span>
            </div>
          </div>
        </section>
        <aside className="inspector" aria-label="Model settings">
          <div className="weapon-heading">
            <div className="eyebrow">HIGH-CALIBER SNIPER-SCYTHE</div>
            <h1>
              CRESCENT
              <br />
              ROSE<span className="title-period">.</span>
            </h1>
            <p>
              Ruby Rose’s signature weapon,
              <br />
              reconstructed in three dimensions.
            </p>
            <div className="weapon-tags">
              <span>RWBY</span>
              <span>Scythe form</span>
              <span>Fan reconstruction</span>
            </div>
          </div>
          <section className="settings-section">
            <div className="section-heading">
              <h2>Surface</h2>
              <ScanLine size={16} />
            </div>
            <Tabs
              value={finish}
              onValueChange={(value) => {
                const f = value as Finish;
                setFinish(f);
                api.current?.setFinish(f);
              }}
            >
              <TabsList className="finish-tabs">
                <TabsTrigger value="studio" disabled={!ready}>
                  Studio
                </TabsTrigger>
                <TabsTrigger value="original" disabled={!ready}>
                  Matte
                </TabsTrigger>
                <TabsTrigger value="wireframe" disabled={!ready}>
                  Wireframe
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <p className="setting-note">
              {finish === 'studio'
                ? 'Painted red metal. Brushed steel edges.'
                : finish === 'original'
                  ? 'Soft, flat materials inspired by the show.'
                  : 'Explore the underlying model geometry.'}
            </p>
          </section>
          <section className="settings-section">
            <div className="section-heading">
              <h2>Scene</h2>
              <Grid2X2 size={15} />
            </div>
            <label className="toggle-row" htmlFor="auto-rotate">
              <span>Auto-rotate</span>
              <Switch
                id="auto-rotate"
                checked={rotate}
                disabled={!ready}
                onCheckedChange={(v) => {
                  setRotate(v);
                  api.current?.setAutoRotate(v);
                }}
                aria-label="Auto-rotate"
              />
            </label>
            <label className="toggle-row" htmlFor="ground-grid">
              <span>Ground grid</span>
              <Switch
                id="ground-grid"
                checked={grid}
                disabled={!ready}
                onCheckedChange={(v) => {
                  setGrid(v);
                  api.current?.setGrid(v);
                }}
                aria-label="Ground grid"
              />
            </label>
            <div className="explode-label">
              <label htmlFor="explode-slider">Separate parts</label>
              <span>{explode}%</span>
            </div>
            <Slider
              id="explode-slider"
              aria-label="Separate model parts"
              value={[explode]}
              min={0}
              max={100}
              step={1}
              disabled={!ready}
              onValueChange={(v) => {
                const n = Array.isArray(v) ? v[0] : v;
                setExplode(n);
                api.current?.setExplode(n / 100);
              }}
            />
          </section>
          <section className="settings-section parts-section">
            <div className="section-heading">
              <h2>Inspect a detail</h2>
              <Focus size={16} />
            </div>
            <div className="parts-list">
              {parts.map((p) => (
                <button
                  disabled={!ready}
                  key={p.id}
                  className={part === p.id ? 'selected' : ''}
                  aria-pressed={part === p.id}
                  onClick={() => {
                    if (part === p.id) {
                      changeView('hero');
                      return;
                    }
                    setPart(p.id);
                    setRotate(false);
                    api.current?.focusPart(p.id);
                  }}
                >
                  <span className="part-mark">
                    <Crosshair size={13} />
                  </span>
                  <span>{p.name}</span>
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
            {selected && (
              <p className="detail-description">{selected.description}</p>
            )}
          </section>
          <div className="inspector-bottom">
            <button
              className="export-button"
              disabled={!ready || exporting}
              onClick={exportModel}
            >
              {exporting ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ArrowDownToLine size={16} />
              )}
              <span>{exporting ? 'Exporting…' : 'Export 3D model'}</span>
              <span className="file-type">GLB</span>
            </button>
            <button
              className="about-button"
              onClick={() => setReference(!reference)}
            >
              About this reconstruction{' '}
              <ChevronRight size={13} className={reference ? 'turned' : ''} />
            </button>
            {reference && (
              <div className="reference-note">
                Modeled from the{' '}
                <a
                  href="https://rwby.fandom.com/wiki/Crescent_Rose/Image_Gallery"
                  target="_blank"
                  rel="noreferrer"
                >
                  production render and RWBY references{' '}
                  <ArrowUpRight size={12} />
                </a>
                . Proportions are estimated from images. This study depicts the
                extended form; it does not simulate the folding sequence. RWBY
                and Crescent Rose belong to their respective rights holders.
              </div>
            )}
          </div>
        </aside>
      </div>
      {notice && (
        <output className="notice" aria-live="polite">
          <Check size={15} />
          {notice}
        </output>
      )}
    </main>
  );
}
