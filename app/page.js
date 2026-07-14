'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  STEPS,
  UNIFORM_STEP,
  buildPrompt,
  buildFeedbackPrompt,
} from '../lib/prompts';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

let idCounter = 0;
const newId = () => `p${Date.now()}_${idCounter++}`;

// Ridimensiona lato client (max 2048px) per stare nei limiti di
// payload di Vercel e ridurre i costi API.
async function fileToDataUri(file, maxSide = 2048) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Una singola chiamata di edit: gestisce sia FAL (queue+polling)
// sia Google (sincrono). Restituisce sempre un data URI.
async function runEdit({ provider, prompt, images }) {
  const res = await fetch('/api/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, prompt, images }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Errore ${res.status}`);

  if (data.mode === 'done') return data.image;

  // FAL queue: polling fino a 3 minuti
  const started = Date.now();
  while (Date.now() - started < 180000) {
    await sleep(2500);
    const s = await fetch('/api/edit/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        statusUrl: data.statusUrl,
        responseUrl: data.responseUrl,
      }),
    });
    const sd = await s.json();
    if (sd.status === 'COMPLETED') return sd.image;
    if (sd.status === 'FAILED' || (!s.ok && sd.error)) {
      throw new Error(sd.error || 'Job fallito');
    }
  }
  throw new Error('Timeout: il job ha impiegato troppo tempo');
}

async function analyzePhoto(image) {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image }),
    });
    const data = await res.json();
    if (data.available && data.analysis) return data.analysis;
  } catch {
    /* l'analisi non è mai bloccante */
  }
  return null;
}

// Step applicati in automatico (background_rescale è escluso: solo manuale)
const AUTO_STEPS = STEPS.filter((s) => s.analysisKey !== null);

const STATUS_LABEL = {
  idle: 'In attesa',
  analyzing: 'Analisi…',
  processing: 'Elaborazione…',
  uniforming: 'Uniformo il set…',
  done: 'Pronta',
  error: 'Errore',
};

// ------------------------------------------------------------
// Componente principale
// ------------------------------------------------------------

export default function Home() {
  const [config, setConfig] = useState(null);
  const [provider, setProvider] = useState(null);
  const [format, setFormat] = useState('1:1');
  const [uniformSet, setUniformSet] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, msg: '' });
  const [drag, setDrag] = useState(false);
  const fileInput = useRef(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        setProvider(c.defaultProvider);
      })
      .catch(() => setConfig({ providers: {}, defaultProvider: null }));
  }, []);

  const patchPhoto = useCallback((id, patch) => {
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p))
    );
  }, []);

  // ---------------- upload ----------------

  const addFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList).filter((f) =>
      f.type.startsWith('image/')
    );
    for (const f of files) {
      try {
        const dataUri = await fileToDataUri(f);
        setPhotos((prev) => [
          ...prev,
          {
            id: newId(),
            name: f.name,
            original: dataUri,
            current: dataUri,
            history: [],
            status: 'idle',
            stepsDone: [],
            feedback: [],
            feedbackDraft: '',
            showOriginal: false,
            showFeedback: false,
            advancedOpen: false,
            advancedSel: Object.fromEntries(AUTO_STEPS.map((s) => [s.id, true])),
            error: null,
          },
        ]);
      } catch {
        /* file illeggibile: lo saltiamo */
      }
    }
  }, []);

  // ---------------- pipeline automatica ----------------

  async function processPhoto(photo) {
    patchPhoto(photo.id, { status: 'analyzing', error: null });

    const analysis = await analyzePhoto(photo.current);
    // Con analisi: solo gli step necessari. Senza: tutti quelli automatici.
    const steps = analysis
      ? AUTO_STEPS.filter((s) => analysis[s.analysisKey])
      : AUTO_STEPS;

    patchPhoto(photo.id, { status: 'processing' });

    let img = photo.current;
    const done = [];
    for (const step of steps) {
      const prompt = buildPrompt(step, {
        format,
        feedback: photosRef.current.find((p) => p.id === photo.id)?.feedback,
      });
      img = await runEdit({ provider, prompt, images: [img] });
      done.push(step.label);
      patchPhoto(photo.id, (p) => ({
        history: [...p.history, p.current],
        current: img,
        stepsDone: [...p.stepsDone, step.label],
      }));
    }

    if (steps.length === 0) {
      patchPhoto(photo.id, {
        stepsDone: ['Nessuna correzione necessaria'],
      });
    }
    patchPhoto(photo.id, { status: 'done' });
    return img;
  }

  async function runAll() {
    const targets = photosRef.current.filter((p) => p.status !== 'processing');
    if (targets.length === 0 || !provider) return;
    setRunning(true);
    const extra = uniformSet && targets.length > 1 ? targets.length - 1 : 0;
    setProgress({ done: 0, total: targets.length + extra, msg: '' });

    const results = [];
    for (let i = 0; i < targets.length; i++) {
      const p = targets[i];
      setProgress((pr) => ({
        ...pr,
        msg: `Foto ${i + 1} di ${targets.length}: ${p.name}`,
      }));
      try {
        const img = await processPhoto(p);
        results.push({ id: p.id, img });
      } catch (err) {
        patchPhoto(p.id, { status: 'error', error: err.message });
      }
      setProgress((pr) => ({ ...pr, done: pr.done + 1 }));
    }

    // Step finale: uniforma colore/luce del set usando la prima
    // foto riuscita come riferimento.
    if (uniformSet && results.length > 1) {
      const [ref, ...rest] = results;
      for (const r of rest) {
        patchPhoto(r.id, { status: 'uniforming' });
        setProgress((pr) => ({ ...pr, msg: 'Uniformo colori e luce del set…' }));
        try {
          const img = await runEdit({
            provider,
            prompt: buildPrompt(UNIFORM_STEP, { format }),
            images: [ref.img, r.img],
          });
          patchPhoto(r.id, (p) => ({
            history: [...p.history, p.current],
            current: img,
            stepsDone: [...p.stepsDone, UNIFORM_STEP.label],
            status: 'done',
          }));
        } catch (err) {
          patchPhoto(r.id, { status: 'done', error: `Uniformità saltata: ${err.message}` });
        }
        setProgress((pr) => ({ ...pr, done: pr.done + 1 }));
      }
    }

    setProgress((pr) => ({ ...pr, msg: 'Finito!' }));
    setRunning(false);
  }

  // ---------------- feedback ("Non mi convince") ----------------

  async function sendFeedback(photo) {
    const text = photo.feedbackDraft.trim();
    if (!text) return;
    patchPhoto(photo.id, (p) => ({
      status: 'processing',
      error: null,
      feedback: [...p.feedback, text],
      feedbackDraft: '',
      showFeedback: false,
    }));
    try {
      const img = await runEdit({
        provider,
        prompt: buildFeedbackPrompt(text),
        images: [photo.current],
      });
      patchPhoto(photo.id, (p) => ({
        history: [...p.history, p.current],
        current: img,
        stepsDone: [...p.stepsDone, `Correzione: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`],
        status: 'done',
      }));
    } catch (err) {
      patchPhoto(photo.id, { status: 'error', error: err.message });
    }
  }

  // ---------------- modalità avanzata ----------------

  async function runSingleStep(photo, step) {
    patchPhoto(photo.id, { status: 'processing', error: null });
    try {
      const prompt = buildPrompt(step, { format, feedback: photo.feedback });
      const img = await runEdit({ provider, prompt, images: [photo.current] });
      patchPhoto(photo.id, (p) => ({
        history: [...p.history, p.current],
        current: img,
        stepsDone: [...p.stepsDone, step.label],
        status: 'done',
      }));
    } catch (err) {
      patchPhoto(photo.id, { status: 'error', error: err.message });
    }
  }

  async function runSelectedSteps(photo) {
    const sel = STEPS.filter((s) => photo.advancedSel[s.id]);
    patchPhoto(photo.id, { status: 'processing', error: null });
    try {
      let img = photo.current;
      for (const step of sel) {
        const prompt = buildPrompt(step, { format, feedback: photo.feedback });
        img = await runEdit({ provider, prompt, images: [img] });
        patchPhoto(photo.id, (p) => ({
          history: [...p.history, p.current],
          current: img,
          stepsDone: [...p.stepsDone, step.label],
        }));
      }
      patchPhoto(photo.id, { status: 'done' });
    } catch (err) {
      patchPhoto(photo.id, { status: 'error', error: err.message });
    }
  }

  function undo(photo) {
    if (photo.history.length === 0) return;
    patchPhoto(photo.id, (p) => ({
      current: p.history[p.history.length - 1],
      history: p.history.slice(0, -1),
      stepsDone: p.stepsDone.slice(0, -1),
    }));
  }

  function resetOriginal(photo) {
    patchPhoto(photo.id, (p) => ({
      current: p.original,
      history: [],
      stepsDone: [],
      status: 'idle',
      error: null,
    }));
  }

  // ---------------- download ----------------

  function downloadOne(photo) {
    const a = document.createElement('a');
    a.href = photo.current;
    a.download = `baked-by-eli_${photo.name.replace(/\.[^.]+$/, '')}.jpg`;
    a.click();
  }

  async function downloadAll() {
    const done = photos.filter((p) => p.stepsDone.length > 0 || p.status === 'done');
    if (done.length === 0) return;
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    done.forEach((p, i) => {
      const base64 = p.current.split(',')[1];
      zip.file(
        `baked-by-eli_${String(i + 1).padStart(2, '0')}_${p.name.replace(/\.[^.]+$/, '')}.jpg`,
        base64,
        { base64: true }
      );
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'baked-by-eli_foto.zip';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------------- render ----------------

  const noProvider = config && !config.providers.fal && !config.providers.google;
  const readyCount = photos.filter((p) => p.status === 'done').length;

  return (
    <div className="container">
      <header className="header">
        <div className="logo-circle" aria-hidden="true">
          baked
          <br />
          by eli
        </div>
        <div>
          <h1>Studio Foto</h1>
          <p className="sub">
            Carica le foto delle torte → ricevi le immagini pronte per
            Instagram.
          </p>
        </div>
      </header>

      {noProvider && (
        <div className="toolbar" role="alert">
          <span style={{ color: 'var(--errore)', fontWeight: 700 }}>
            Nessuna chiave API configurata. Aggiungi FAL_KEY (o GOOGLE_API_KEY)
            alle variabili di ambiente e ricarica.
          </span>
        </div>
      )}

      <div className="toolbar">
        <label>
          Formato
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="1:1">Quadrato 1:1</option>
            <option value="4:5">Verticale 4:5</option>
            <option value="9:16">Storie 9:16</option>
          </select>
        </label>

        {config?.providers.fal && config?.providers.google && (
          <label>
            Motore
            <select
              value={provider || ''}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="fal">FAL (Nano Banana)</option>
              <option value="google">Google Gemini</option>
            </select>
          </label>
        )}

        <label className="toggle">
          <input
            type="checkbox"
            checked={uniformSet}
            onChange={(e) => setUniformSet(e.target.checked)}
          />
          Uniforma colori e luce del set
        </label>

        {config && !config.analysis && (
          <span style={{ fontSize: 12.5, color: 'var(--grigio)' }}>
            Analisi automatica non attiva (serve GOOGLE_API_KEY): applico tutte
            le correzioni a ogni foto.
          </span>
        )}
      </div>

      <div
        className={`dropzone${drag ? ' drag' : ''}`}
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
      >
        <p className="big">Trascina qui le foto delle torte</p>
        <p className="hint">oppure clicca per sceglierle — anche 20 insieme</p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {photos.length === 0 && (
        <p className="empty">
          Le foto caricate appariranno qui, pronte da sistemare con un tocco.
        </p>
      )}

      <div className="grid">
        {photos.map((p) => (
          <div className="card" key={p.id}>
            <div className="imgwrap">
              <img
                src={p.showOriginal ? p.original : p.current}
                alt={p.name}
              />
              <span className="badge">
                <span
                  className={`dot ${
                    p.status === 'done'
                      ? 'done'
                      : p.status === 'error'
                      ? 'error'
                      : p.status === 'idle'
                      ? ''
                      : 'working'
                  }`}
                />
                {STATUS_LABEL[p.status]}
              </span>
              {p.history.length > 0 && (
                <button
                  className="compare-btn"
                  onMouseDown={() => patchPhoto(p.id, { showOriginal: true })}
                  onMouseUp={() => patchPhoto(p.id, { showOriginal: false })}
                  onMouseLeave={() => patchPhoto(p.id, { showOriginal: false })}
                  onTouchStart={() => patchPhoto(p.id, { showOriginal: true })}
                  onTouchEnd={() => patchPhoto(p.id, { showOriginal: false })}
                >
                  Tieni premuto: originale
                </button>
              )}
            </div>

            <div className="body">
              <span className="name">{p.name}</span>

              {p.stepsDone.length > 0 && (
                <span className="steps-done">✓ {p.stepsDone.join(' · ')}</span>
              )}
              {p.error && <span className="errmsg">{p.error}</span>}

              <div className="row">
                {p.status === 'done' && (
                  <>
                    <button className="btn small" onClick={() => downloadOne(p)}>
                      Scarica
                    </button>
                    <button
                      className="btn small"
                      onClick={() =>
                        patchPhoto(p.id, { showFeedback: !p.showFeedback })
                      }
                    >
                      Non mi convince
                    </button>
                  </>
                )}
                {p.history.length > 0 && (
                  <button className="btn small" onClick={() => undo(p)}>
                    Annulla ultimo
                  </button>
                )}
                <button
                  className="btn small"
                  onClick={() =>
                    patchPhoto(p.id, { advancedOpen: !p.advancedOpen })
                  }
                >
                  {p.advancedOpen ? 'Chiudi avanzate' : 'Avanzate'}
                </button>
                <button
                  className="btn small"
                  onClick={() =>
                    setPhotos((prev) => prev.filter((x) => x.id !== p.id))
                  }
                >
                  Rimuovi
                </button>
              </div>

              {p.showFeedback && (
                <div className="feedback-box">
                  <textarea
                    placeholder='Cosa non va? Es. "il colore del fondale è diverso dall&apos;originale", "l&apos;ombra è troppo dura"…'
                    value={p.feedbackDraft}
                    onChange={(e) =>
                      patchPhoto(p.id, { feedbackDraft: e.target.value })
                    }
                  />
                  <div className="row" style={{ marginTop: 8 }}>
                    <button
                      className="btn small primary"
                      disabled={!p.feedbackDraft.trim()}
                      onClick={() => sendFeedback(p)}
                    >
                      Correggi con questa indicazione
                    </button>
                  </div>
                </div>
              )}

              {p.advancedOpen && (
                <div className="advanced">
                  {STEPS.map((s) => (
                    <div className="steprow" key={s.id}>
                      <label className="lbl">
                        <input
                          type="checkbox"
                          checked={Boolean(p.advancedSel[s.id])}
                          onChange={(e) =>
                            patchPhoto(p.id, {
                              advancedSel: {
                                ...p.advancedSel,
                                [s.id]: e.target.checked,
                              },
                            })
                          }
                        />
                        <span>
                          {s.label}
                          <br />
                          <span className="desc">{s.short}</span>
                        </span>
                      </label>
                      <button
                        className="btn small"
                        disabled={p.status === 'processing' || !provider}
                        onClick={() => runSingleStep(p, s)}
                      >
                        Esegui
                      </button>
                    </div>
                  ))}
                  <div className="row">
                    <button
                      className="btn small primary"
                      disabled={p.status === 'processing' || !provider}
                      onClick={() => runSelectedSteps(p)}
                    >
                      Esegui step selezionati
                    </button>
                    <button
                      className="btn small"
                      onClick={() => resetOriginal(p)}
                    >
                      Ripristina originale
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="actionbar">
        <div className="inner">
          <button
            className="btn primary big"
            disabled={running || photos.length === 0 || !provider}
            onClick={runAll}
          >
            {running ? 'Sto sistemando…' : `✨ Sistema tutto (${photos.length})`}
          </button>

          {(running || progress.total > 0) && (
            <div className="progress">
              <div className="track">
                <div
                  className="fill"
                  style={{
                    width: `${
                      progress.total
                        ? Math.round((progress.done / progress.total) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
              <div className="txt">
                {progress.done}/{progress.total} {progress.msg}
              </div>
            </div>
          )}

          {readyCount > 0 && !running && (
            <button className="btn big" onClick={downloadAll}>
              Scarica tutte ({readyCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
