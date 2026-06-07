'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CoachRequestType, CoachResponse } from '@/lib/coach';

const panelStyle: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,77,31,0.08), rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,77,31,0.22)',
  borderRadius: 16,
  padding: '18px 18px 16px',
};

const buttons: { type: CoachRequestType; title: string; description: string }[] = [
  {
    type: 'analyze_last_runs',
    title: 'Analizza ultime corse',
    description: 'Trend, fatica, walk breaks e segnale di carico.',
  },
  {
    type: 'pre_race_brief',
    title: 'Briefing pre-corsa',
    description: 'Warm-up, ritmo, regole pratiche e focus mentale.',
  },
  {
    type: 'update_plan',
    title: 'Aggiorna piano',
    description: 'Suggerisce come adattare la prossima seduta.',
  },
  {
    type: 'post_run_review',
    title: 'Post-corsa',
    description: 'Lettura veloce dopo una sessione appena finita.',
  },
];

function StatusPill({ risk }: { risk: CoachResponse['risk_level'] }) {
  const styles =
    risk === 'high'
      ? { color: 'var(--orange)', bg: 'rgba(255,77,31,0.16)', text: 'ALTO' }
      : risk === 'medium'
        ? { color: 'var(--yellow)', bg: 'rgba(255,201,60,0.14)', text: 'MEDIO' }
        : { color: 'var(--green)', bg: 'rgba(0,217,144,0.14)', text: 'BASSO' };

  return (
    <span
      className="mono"
      style={{
        fontSize: 9,
        color: styles.color,
        background: styles.bg,
        padding: '3px 8px',
        borderRadius: 999,
        letterSpacing: '0.16em',
        fontWeight: 700,
      }}
    >
      RISK {styles.text}
    </span>
  );
}

export default function CoachPanel() {
  const [requestType, setRequestType] = useState<CoachRequestType>('analyze_last_runs');
  const [userMessage, setUserMessage] = useState('');
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runCoach(type: CoachRequestType = requestType) {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_type: type,
          user_message: userMessage.trim() || undefined,
        }),
      });

      const data = (await res.json()) as CoachResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Risposta non disponibile.');
      }

      setRequestType(type);
      setResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void runCoach('analyze_last_runs');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section style={panelStyle} className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: '0.22em', marginBottom: 6 }}>
            AI COACH
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
            Assistente operativo per analisi, piano e briefing pre-corsa
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>
            Scegli un’azione, aggiungi una nota libera, e l’AI risponde sui dati reali della dashboard.
          </div>
        </div>

        {response && <StatusPill risk={response.risk_level} />}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 12 }}>
        {buttons.map((button) => {
          const active = button.type === requestType;
          return (
            <button
              key={button.type}
              type="button"
              onClick={() => void runCoach(button.type)}
              style={{
                textAlign: 'left',
                borderRadius: 12,
                padding: '14px 14px 13px',
                border: `1px solid ${active ? 'rgba(255,77,31,0.45)' : 'var(--border)'}`,
                background: active ? 'rgba(255,77,31,0.08)' : 'rgba(255,255,255,0.02)',
                color: 'var(--text)',
                cursor: 'pointer',
                transition: 'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 5, color: active ? 'var(--orange)' : 'var(--text)' }}>
                {button.title}
              </div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                {button.description}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.9fr', gap: 12 }}>
        <div>
          <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em', display: 'block', marginBottom: 6 }}>
            NOTA RAPIDA
          </label>
          <textarea
            value={userMessage}
            onChange={(event) => setUserMessage(event.target.value)}
            placeholder="Esempio: oggi ho caldo, le gambe sono pesanti, oppure 'voglio capire se sto andando troppo forte'."
            rows={4}
            style={{
              width: '100%',
              resize: 'vertical',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text)',
              padding: '12px 14px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12,
              lineHeight: 1.6,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => void runCoach(requestType)}
            disabled={loading}
            style={{
              border: 'none',
              borderRadius: 12,
              padding: '12px 14px',
              background: loading ? 'rgba(255,77,31,0.45)' : 'var(--orange)',
              color: 'white',
              fontWeight: 700,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Sto leggendo i dati...' : 'Lancia coach'}
          </button>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Se hai configurato `OPENAI_API_KEY`, la risposta usa il modello AI. Altrimenti scatta il fallback analitico locale.
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          marginTop: 14,
          border: '1px solid rgba(255,77,31,0.25)',
          borderRadius: 12,
          padding: '12px 14px',
          background: 'rgba(255,77,31,0.06)',
        }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: '0.18em', marginBottom: 6 }}>
            ERRORE COACH
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{error}</div>
        </div>
      )}

      {response && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <div style={{ padding: '14px 15px', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 8 }}>
              SINTESI
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>{response.summary}</div>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-dim)', marginTop: 8 }}>{response.recommendation}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div style={{ padding: '14px 15px', borderRadius: 12, background: 'rgba(58,126,255,0.07)', border: '1px solid rgba(58,126,255,0.18)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--blue)', letterSpacing: '0.18em', marginBottom: 8 }}>
                PUNTI CHIAVE
              </div>
              <ul style={{ paddingLeft: 16, display: 'grid', gap: 6, color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.55 }}>
                {response.key_points.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div style={{ padding: '14px 15px', borderRadius: 12, background: 'rgba(255,201,60,0.07)', border: '1px solid rgba(255,201,60,0.16)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--yellow)', letterSpacing: '0.18em', marginBottom: 8 }}>
                RISCHI
              </div>
              <ul style={{ paddingLeft: 16, display: 'grid', gap: 6, color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.55 }}>
                {response.risks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {response.next_session && (
            <div style={{ padding: '14px 15px', borderRadius: 12, background: 'rgba(0,217,144,0.06)', border: '1px solid rgba(0,217,144,0.16)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--green)', letterSpacing: '0.18em', marginBottom: 8 }}>
                PROSSIMA USCITA
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
                <div className="num" style={{ fontSize: 36, color: 'var(--text)' }}>{response.next_session.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>{response.next_session.content}</div>
              </div>
            </div>
          )}

          {response.pre_run_brief && (
            <div style={{ padding: '14px 15px', borderRadius: 12, background: 'rgba(255,77,31,0.05)', border: '1px solid rgba(255,77,31,0.14)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: '0.18em', marginBottom: 8 }}>
                BRIEFING PRE-RUN
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>
                  <strong style={{ color: 'var(--text)' }}>Warm-up:</strong> {response.pre_run_brief.warmup}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-dim)' }}>
                  <strong style={{ color: 'var(--text)' }}>Target:</strong> {response.pre_run_brief.target}
                </div>
                <ul style={{ paddingLeft: 16, display: 'grid', gap: 6, color: 'var(--text-dim)', fontSize: 13, lineHeight: 1.55 }}>
                  {response.pre_run_brief.rules.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div style={{ padding: '14px 15px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 8 }}>
              USCITE CONSIDERATE
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.6 }}>
              <span>Sessioni: {response.source.sessions_considered}</span>
              <span>Ultima: {response.source.latest_session_label ?? '—'}</span>
              <span>Prossima: {response.source.next_session_label ?? '—'}</span>
              <span>Settimana corrente: {response.source.current_week ?? '—'}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
