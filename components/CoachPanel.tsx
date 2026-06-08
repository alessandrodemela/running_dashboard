'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CoachRequestType, CoachResponse } from '@/lib/coach';

const panelStyle: CSSProperties = {
  background: 'linear-gradient(180deg, rgba(255,77,31,0.08), rgba(255,255,255,0.02))',
  border: '1px solid rgba(255,77,31,0.22)',
  borderRadius: 14,
  padding: '14px 14px 12px',
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
      ? { color: 'var(--orange)', bg: 'rgba(255,77,31,0.16)', text: 'ATTENZIONE' }
      : risk === 'medium'
        ? { color: 'var(--yellow)', bg: 'rgba(255,201,60,0.14)', text: 'DA TENERE' }
        : { color: 'var(--green)', bg: 'rgba(0,217,144,0.14)', text: 'OK' };

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
      CARICO {styles.text}
    </span>
  );
}

export default function CoachPanel() {
  const [requestType, setRequestType] = useState<CoachRequestType>('analyze_last_runs');
  const [provider, setProvider] = useState<'auto' | 'openai' | 'anthropic' | 'local'>('auto');
  const [model, setModel] = useState('gpt-5.4-mini');
  const [userMessage, setUserMessage] = useState('');
  const [response, setResponse] = useState<CoachResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  async function runCoach(type: CoachRequestType = requestType) {
    setLoading(true);
    setApplyMessage(null);
    setError(null);
    setShowDetails(false);

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          request_type: type,
          user_message: userMessage.trim() || undefined,
          provider,
          model: model.trim() || undefined,
        }),
      });

      const data = (await res.json()) as CoachResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Risposta non disponibile.');
      }

      setRequestType(type);
      setResponse(data);
      setShowDetails(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto.');
    } finally {
      setLoading(false);
    }
  }

  async function applyProposal() {
    if (!response?.change_proposal) return;

    const confirmed = window.confirm(
      `Applico questa modifica a ${response.change_proposal.target_label}?\n\nMotivo: ${response.change_proposal.reason}`,
    );
    if (!confirmed) return;

    setApplying(true);
    setError(null);
    setApplyMessage(null);

    try {
      const res = await fetch('/api/coach/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ proposal: response.change_proposal }),
      });

      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        updated?: {
          target_id: string;
          target_label: string;
          content: string;
        };
      };

      if (!res.ok || !data.ok || !data.updated) {
        if (res.status === 409 && data.updated) {
          throw new Error('La proposta è diventata obsoleta. Ricarica l’analisi e riprova.');
        }
        throw new Error(data.error || 'Applicazione fallita.');
      }

      setApplyMessage(`Aggiornato ${data.updated.target_label} con successo.`);
      setResponse((current) => current ? {
        ...current,
        next_session: current.next_session && current.change_proposal && current.change_proposal.target_id === data.updated?.target_id
          ? { ...current.next_session, content: data.updated.content }
          : current.next_session,
        change_proposal: null,
      } : current);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto.');
    } finally {
      setApplying(false);
    }
  }

  useEffect(() => {
    if (!collapsed && !response && !loading) {
      void runCoach('analyze_last_runs');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  return (
    <section style={panelStyle} className="fade-up">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: '0.22em', marginBottom: 6 }}>
            AI COACH
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
            Assistente operativo per analisi, piano e briefing pre-corsa
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            style={{
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text)',
              borderRadius: 999,
              padding: '7px 10px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {collapsed ? 'Apri coach' : 'Comprimi coach'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, marginBottom: 10 }}>
            {buttons.map((button) => {
              const active = button.type === requestType;
              return (
                <button
                  key={button.type}
                  type="button"
                  onClick={() => setRequestType(button.type)}
                  style={{
                    textAlign: 'left',
                    borderRadius: 11,
                    padding: '11px 12px 10px',
                    border: `1px solid ${active ? 'rgba(255,77,31,0.45)' : 'var(--border)'}`,
                    background: active ? 'rgba(255,77,31,0.08)' : 'rgba(255,255,255,0.02)',
                    color: 'var(--text)',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, border-color 0.15s ease, background 0.15s ease',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 4, color: active ? 'var(--orange)' : 'var(--text)' }}>
                    {button.title}
                  </div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-dim)', lineHeight: 1.45 }}>
                    {button.description}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 0.9fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em' }}>
                PROVIDER
              </span>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value as typeof provider)}
                style={{
                  width: '100%',
                  borderRadius: 11,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  outline: 'none',
                }}
              >
                <option value="auto">Auto</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="local">Locale</option>
              </select>
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em' }}>
                MODELLO
              </span>
              <select
                value={model}
                onChange={(event) => setModel(event.target.value)}
                style={{
                  width: '100%',
                  borderRadius: 11,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  outline: 'none',
                }}
              >
                <option value="gpt-5.4-mini">gpt-5.4-mini</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="claude-3-5-haiku-20241022">claude-3-5-haiku-20241022</option>
                <option value="claude-sonnet-4-20250514">claude-sonnet-4-20250514</option>
              </select>
            </label>

            <div>
              <label className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em', display: 'block', marginBottom: 6 }}>
                NOTA OPERATIVA
              </label>
              <textarea
                value={userMessage}
                onChange={(event) => setUserMessage(event.target.value)}
                placeholder="Esempio: oggi ho caldo, gambe pesanti, oppure voglio capire se sto partendo troppo forte."
                rows={3}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  borderRadius: 11,
                  border: '1px solid var(--border)',
                  background: 'rgba(255,255,255,0.02)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11.5,
                  lineHeight: 1.5,
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
                  borderRadius: 11,
                  padding: '10px 12px',
                  background: loading ? 'rgba(255,77,31,0.45)' : 'var(--orange)',
                  color: 'white',
                  fontWeight: 700,
                  cursor: loading ? 'wait' : 'pointer',
                }}
              >
                {loading ? 'Sto leggendo i dati...' : 'Lancia coach'}
              </button>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Con `OPENAI_API_KEY` il coach usa il modello AI. Senza chiave, usa il fallback analitico locale.
              </div>
            </div>
          </div>
        </>
      )}

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
            <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{error}</div>
        </div>
      )}

      {applyMessage && (
        <div style={{
          marginTop: 14,
          border: '1px solid rgba(0,217,144,0.25)',
          borderRadius: 12,
          padding: '12px 14px',
          background: 'rgba(0,217,144,0.06)',
        }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--green)', letterSpacing: '0.18em', marginBottom: 6 }}>
            MODIFICA APPLICATA
          </div>
          <div style={{ fontSize: 13, color: 'var(--text)' }}>{applyMessage}</div>
        </div>
      )}

      {!collapsed && response && (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <div style={{ padding: '12px 13px', borderRadius: 11, background: 'rgba(255,255,255,0.025)', border: '1px solid var(--border)' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 8 }}>
              SINTESI
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}>{response.summary}</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-dim)', marginTop: 6 }}>{response.recommendation}</div>
          </div>

          <div style={{ padding: '11px 12px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 6 }}>
              STATO ATTUALE
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>
              {response.risk_level === 'high'
                ? 'Serve prudenza sulla prossima uscita.'
                : response.risk_level === 'medium'
                  ? 'Piano ok, ma con attenzione.'
                  : 'Stato buono, continua così.'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDetails((value) => !value)}
            style={{
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--text)',
              borderRadius: 999,
              padding: '8px 12px',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              justifySelf: 'start',
            }}
          >
            {showDetails ? 'Nascondi dettagli' : 'Mostra dettagli'}
          </button>

          {showDetails && (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ padding: '12px 13px', borderRadius: 11, background: 'rgba(58,126,255,0.07)', border: '1px solid rgba(58,126,255,0.18)' }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--blue)', letterSpacing: '0.18em', marginBottom: 8 }}>
                  COSA CONTA
                </div>
                <ul style={{ paddingLeft: 16, display: 'grid', gap: 5, color: 'var(--text-dim)', fontSize: 12.5, lineHeight: 1.45 }}>
                  {response.key_points.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div style={{ padding: '12px 13px', borderRadius: 11, background: 'rgba(255,201,60,0.07)', border: '1px solid rgba(255,201,60,0.16)' }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--yellow)', letterSpacing: '0.18em', marginBottom: 8 }}>
                  COSA NON VA IGNORATO
                </div>
                <ul style={{ paddingLeft: 16, display: 'grid', gap: 5, color: 'var(--text-dim)', fontSize: 12.5, lineHeight: 1.45 }}>
                  {response.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {showDetails && response.next_session && (
            <div style={{ padding: '12px 13px', borderRadius: 11, background: 'rgba(0,217,144,0.06)', border: '1px solid rgba(0,217,144,0.16)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--green)', letterSpacing: '0.18em', marginBottom: 8 }}>
                PROSSIMA USCITA
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 8 }}>
                <div className="num" style={{ fontSize: 32, color: 'var(--text)' }}>{response.next_session.label}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.45 }}>{response.next_session.content}</div>
              </div>
            </div>
          )}

          {showDetails && response.change_proposal && (
            <div style={{ padding: '12px 13px', borderRadius: 11, background: 'rgba(255,77,31,0.05)', border: '1px solid rgba(255,77,31,0.16)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: '0.18em', marginBottom: 8 }}>
                PROPOSTA PRONTA DA RIVEDERE
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text)' }}>Target:</strong> {response.change_proposal.target_label}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text)' }}>Motivo:</strong> {response.change_proposal.reason}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--text)' }}>Before</strong>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{response.change_proposal.before}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--text)' }}>After</strong>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{response.change_proposal.after}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    Confidence {(response.change_proposal.confidence * 100).toFixed(0)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => void applyProposal()}
                    disabled={applying}
                    style={{
                      border: 'none',
                      borderRadius: 10,
                      padding: '9px 11px',
                      background: applying ? 'rgba(255,77,31,0.5)' : 'var(--orange)',
                      color: 'white',
                      fontWeight: 700,
                      cursor: applying ? 'wait' : 'pointer',
                    }}
                    >
                    {applying ? 'Salvataggio...' : 'Approva e salva'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {showDetails && response.pre_run_brief && (
            <div style={{ padding: '12px 13px', borderRadius: 11, background: 'rgba(255,77,31,0.05)', border: '1px solid rgba(255,77,31,0.14)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: '0.18em', marginBottom: 8 }}>
                BRIEFING PRE-RUN
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-dim)' }}>
                  <strong style={{ color: 'var(--text)' }}>Warm-up:</strong> {response.pre_run_brief.warmup}
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-dim)' }}>
                  <strong style={{ color: 'var(--text)' }}>Target:</strong> {response.pre_run_brief.target}
                </div>
                <ul style={{ paddingLeft: 16, display: 'grid', gap: 5, color: 'var(--text-dim)', fontSize: 12.5, lineHeight: 1.45 }}>
                  {response.pre_run_brief.rules.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {showDetails && (
            <div style={{ padding: '12px 13px', borderRadius: 11, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.18em', marginBottom: 8 }}>
                FONTI USATE
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, color: 'var(--text-dim)', fontSize: 11.5, lineHeight: 1.45 }}>
                <span>Sessioni: {response.source.sessions_considered}</span>
                <span>Ultima: {response.source.latest_session_label ?? '—'}</span>
                <span>Prossima: {response.source.next_session_label ?? '—'}</span>
                <span>Settimana corrente: {response.source.current_week ?? '—'}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
