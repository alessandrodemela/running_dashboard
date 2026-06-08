'use client';

import { useEffect, useState } from 'react';

export interface SessionWritebackSession {
  id?: number;
  data: string;
  week: number;
  distanza_km: string;
  tempo_totale: string;
  passo_medio: string;
  splits?: string | null;
  walk_breaks: string | null;
  dislivello_m: number | null;
  gambe: number;
  rpe: number;
  note: string | null;
}

type SessionWritebackForm = {
  data: string;
  week: string;
  distanza_km: string;
  tempo_totale: string;
  passo_medio: string;
  splits: string;
  walk_breaks: string;
  dislivello_m: string;
  gambe: string;
  rpe: string;
  note: string;
};

const fieldGroups = [
  [
    { key: 'data', label: 'Data', type: 'date' },
    { key: 'week', label: 'Week', type: 'number' },
    { key: 'distanza_km', label: 'Distanza km', type: 'text' },
    { key: 'tempo_totale', label: 'Tempo totale', type: 'text' },
  ],
  [
    { key: 'passo_medio', label: 'Passo medio', type: 'text' },
    { key: 'walk_breaks', label: 'Walk breaks', type: 'text' },
    { key: 'dislivello_m', label: 'Dislivello m', type: 'number' },
  ],
] as const;

function toNullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : '';
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : '';
}

const emptyDraft = {
  data: '',
  week: '',
  distanza_km: '',
  tempo_totale: '',
  passo_medio: '',
  splits: '',
  walk_breaks: '',
  dislivello_m: '',
  gambe: '',
  rpe: '',
  note: '',
};

export default function SessionWritebackModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (session: SessionWritebackSession) => void;
}) {
  const [form, setForm] = useState<SessionWritebackForm>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(emptyDraft);
      setError(null);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const requiredText = [
        ['data', form.data],
        ['distanza_km', form.distanza_km],
        ['tempo_totale', form.tempo_totale],
        ['passo_medio', form.passo_medio],
        ['week', form.week],
        ['gambe', form.gambe],
        ['rpe', form.rpe],
      ] as const;

      const missing = requiredText.find(([, value]) => !String(value).trim());
      if (missing) {
        throw new Error(`Compila il campo ${missing[0]}.`);
      }

      const weekValue = Number(form.week);
      const gambeValue = Number(form.gambe);
      const rpeValue = Number(form.rpe);
      if (!Number.isFinite(weekValue) || !Number.isFinite(gambeValue) || !Number.isFinite(rpeValue)) {
        throw new Error('Week, gambe e RPE devono essere numeri validi.');
      }

      const response = await fetch('/api/session/writeback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            data: form.data,
            week: weekValue,
            distanza_km: form.distanza_km,
            tempo_totale: form.tempo_totale,
            passo_medio: form.passo_medio,
            splits: toNullableText(form.splits) || null,
            walk_breaks: toNullableText(form.walk_breaks) || null,
            dislivello_m: toNullableNumber(form.dislivello_m) ? Number(form.dislivello_m) : null,
            gambe: gambeValue,
            rpe: rpeValue,
            note: toNullableText(form.note) || null,
          },
        }),
      });

      const data = await response.json() as {
        error?: string;
        session?: SessionWritebackSession;
      };

      if (!response.ok || !data.session) {
        throw new Error(data.error || 'Salvataggio fallito.');
      }

      onSaved(data.session);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(2, 4, 8, 0.72)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 'min(960px, 100%)',
          maxHeight: '90vh',
          overflow: 'auto',
          borderRadius: 18,
          border: '1px solid var(--border-bright)',
          background: 'linear-gradient(180deg, #0C1322 0%, #09101C 100%)',
          padding: 18,
          boxShadow: '0 30px 80px rgba(0,0,0,0.45)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: '0.22em', marginBottom: 6 }}>
              WRITEBACK SESSIONE
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
              Salva una nuova sessione
            </div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
              I campi vengono inseriti come nuova riga nel database.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text)',
              borderRadius: 999,
              padding: '8px 11px',
              cursor: 'pointer',
            }}
          >
            Chiudi
          </button>
        </div>

        <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {fieldGroups[0].map((field) => (
              <label key={field.key} style={{ display: 'grid', gap: 6 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em' }}>{field.label}</span>
                <input
                  type={field.type}
                  value={form[field.key]}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  style={{
                    width: '100%',
                    borderRadius: 11,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.02)',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    outline: 'none',
                  }}
                />
              </label>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            {fieldGroups[1].map((field) => (
              <label key={field.key} style={{ display: 'grid', gap: 6 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em' }}>{field.label}</span>
                <input
                  type={field.type}
                  value={form[field.key]}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                  style={{
                    width: '100%',
                    borderRadius: 11,
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.02)',
                    color: 'var(--text)',
                    padding: '10px 12px',
                    outline: 'none',
                  }}
                />
              </label>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginBottom: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em' }}>NOTE</span>
            <textarea
              value={form.note}
              onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
              rows={5}
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 11,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text)',
                padding: '10px 12px',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em' }}>SPLITS</span>
            <textarea
              value={form.splits}
              onChange={(event) => setForm((current) => ({ ...current, splits: event.target.value }))}
              rows={5}
              placeholder="Inserisci i splits se li vuoi salvare"
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 11,
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text)',
                padding: '10px 12px',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
          </label>
        </div>

        {error && (
          <div style={{
            marginBottom: 12,
            border: '1px solid rgba(255,77,31,0.2)',
            background: 'rgba(255,77,31,0.06)',
            borderRadius: 11,
            padding: '10px 12px',
            color: 'var(--text)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            La sessione verrà salvata come nuova riga in `preparazione_corsa_9km`.
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              border: 'none',
              borderRadius: 11,
              padding: '10px 13px',
              background: saving ? 'rgba(255,77,31,0.5)' : 'var(--orange)',
              color: 'white',
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Salvataggio...' : 'Salva sessione'}
          </button>
        </div>
      </div>
    </div>
  );
}
