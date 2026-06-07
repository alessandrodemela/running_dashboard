'use client';

import { useEffect, useState, useMemo, CSSProperties } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';

// ─── Supabase ────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ───────────────────────────────────────────────────
interface Session {
  id: number;
  data: string;
  week: number;
  distanza_km: string;
  tempo_totale: string;
  passo_medio: string;
  walk_breaks: string | null;
  dislivello_m: number | null;
  gambe: number;
  rpe: number;
  note: string | null;
  id_uscita_piano: string | null;
}

interface Uscita {
  id_key: string;
  settimana: number;
  numero_uscita: number;
  contenuto: string;
}

interface Settimana {
  settimana: number;
  obiettivo: string;
  data_inizio: string;
  data_fine: string;
}

// ─── Utils ───────────────────────────────────────────────────
const parsePace = (p: string | null): number | null => {
  if (!p) return null;
  const parts = p.split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0]);
  const s = parseInt(parts[1]);
  if (isNaN(m) || isNaN(s)) return null;
  return m + s / 60;
};

const fmtPace = (d: number): string => {
  const m = Math.floor(d);
  const s = Math.round((d - m) * 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const parseWB = (wb: string | null): number | null => {
  if (wb === null || wb === undefined) return null;
  const n = parseInt(wb.toString().split('/')[0]);
  return isNaN(n) ? null : n;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });

const RACE_DATE = new Date('2026-06-25T09:00:00');

// ─── Shared styles ───────────────────────────────────────────
const card: CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '18px 20px',
};

const label: CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 10,
  color: 'var(--text-dim)',
  letterSpacing: '0.18em',
  marginBottom: 6,
};

// ─── Custom Tooltip ──────────────────────────────────────────
function ChartTooltip({ active, payload, label: lbl }: {
  active?: boolean; payload?: { dataKey: string; name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0D1828',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: '10px 14px',
      minWidth: 120,
    }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>{lbl}</div>
      {payload.map(p => (
        <div key={p.dataKey} className="mono" style={{ fontSize: 13, color: p.color, marginBottom: 2 }}>
          {p.name}:{' '}
          <strong>
            {p.dataKey === 'pace' ? fmtPace(p.value) + '/km' : p.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

// ─── Badge ───────────────────────────────────────────────────
function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span className="mono" style={{
      fontSize: 9,
      color,
      background: bg,
      padding: '2px 7px',
      borderRadius: 4,
      letterSpacing: '0.1em',
      fontWeight: 600,
    }}>{text}</span>
  );
}

// ─── Section Header ──────────────────────────────────────────
function SectionHeader({ tag, title }: { tag: string; title: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: '0.2em', marginBottom: 4 }}>{tag}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{title}</div>
    </div>
  );
}

// ─── Countdown block ─────────────────────────────────────────
function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div className="num" style={{
        fontSize: 40,
        lineHeight: 1,
        color: value === 0 ? 'var(--text-dim)' : 'var(--orange)',
        minWidth: 52,
      }}>
        {value.toString().padStart(2, '0')}
      </div>
      <div className="mono" style={{ fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.15em', marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function Dashboard() {
  const [sessions, setSessions]   = useState<Session[]>([]);
  const [uscite, setUscite]       = useState<Uscita[]>([]);
  const [settimane, setSettimane] = useState<Settimana[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [now, setNow]             = useState(new Date());

  // Live ticker
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const countdown = useMemo(() => {
    const diff = RACE_DATE.getTime() - now.getTime();
    if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0 };
    return {
      d: Math.floor(diff / 86400000),
      h: Math.floor((diff % 86400000) / 3600000),
      m: Math.floor((diff % 3600000) / 60000),
      s: Math.floor((diff % 60000) / 1000),
    };
  }, [now]);

  // Fetch all data
  useEffect(() => {
    Promise.all([
      supabase.from('preparazione_corsa_9km').select('*').order('data', { ascending: true }),
      supabase.from('uscite_piano').select('*').order('settimana', { ascending: true }).order('numero_uscita', { ascending: true }),
      supabase.from('piano_settimane').select('*').order('settimana', { ascending: true }),
    ]).then(([r1, r2, r3]) => {
      if (r1.error || r2.error || r3.error) {
        setError('Errore nel caricamento dati. Verifica le variabili di ambiente Supabase.');
      } else {
        setSessions((r1.data ?? []) as Session[]);
        setUscite((r2.data ?? []) as Uscita[]);
        setSettimane((r3.data ?? []) as Settimana[]);
      }
      setLoading(false);
    }).catch(() => {
      setError('Connessione a Supabase fallita.');
      setLoading(false);
    });
  }, []);

  // ── Derived maps ─────────────────────────────────────────────
  const usciteMap    = useMemo(() => Object.fromEntries(uscite.map(u => [u.id_key, u])), [uscite]);
  const settimaneMap = useMemo(() => Object.fromEntries(settimane.map(s => [s.settimana, s])), [settimane]);
  const completedIds = useMemo(() => new Set(sessions.map(s => s.id_uscita_piano).filter(Boolean)), [sessions]);

  // ── Chart data ───────────────────────────────────────────────
  const chartData = useMemo(() => sessions.map(s => {
    const u = s.id_uscita_piano ? usciteMap[s.id_uscita_piano] : null;
    const pace = parsePace(s.passo_medio);
    const wb   = parseWB(s.walk_breaks);
    return {
      label:   u ? `S${s.week}.${u.numero_uscita}` : `S${s.week}`,
      pace:    pace !== null ? parseFloat(pace.toFixed(3)) : null,
      rpe:     s.rpe,
      gambe:   s.gambe,
      wb:      wb,
      km:      parseFloat(s.distanza_km),
      week:    s.week,
    };
  }), [sessions, usciteMap]);

  const wbChartData = chartData.filter(d => d.wb !== null);

  // ── Aggregate stats ──────────────────────────────────────────
  const totalKm  = sessions.reduce((a, s) => a + parseFloat(s.distanza_km || '0'), 0);
  const paces    = sessions.map(s => parsePace(s.passo_medio)).filter((p): p is number => p !== null);
  const bestPace = paces.length ? Math.min(...paces) : null;
  const avgRpe   = sessions.length ? sessions.reduce((a, s) => a + s.rpe, 0) / sessions.length : 0;
  const lastS    = sessions[sessions.length - 1];

  // ── Next session ─────────────────────────────────────────────
  const nextUscita = useMemo(() =>
    uscite.find(u => !completedIds.has(u.id_key)),
    [uscite, completedIds]
  );

  // ── Plan by week ─────────────────────────────────────────────
  const planByWeek = useMemo(() => {
    const map: Record<number, { meta: Settimana; items: (Uscita & { done: boolean })[] }> = {};
    uscite.forEach(u => {
      if (!map[u.settimana]) map[u.settimana] = { meta: settimaneMap[u.settimana], items: [] };
      map[u.settimana].items.push({ ...u, done: completedIds.has(u.id_key) });
    });
    return Object.entries(map)
      .map(([w, v]) => ({ week: parseInt(w), ...v }))
      .sort((a, b) => a.week - b.week);
  }, [uscite, settimaneMap, completedIds]);

  // ── RPE trend line ───────────────────────────────────────────
  const rpeRef = sessions.length >= 3
    ? sessions.slice(-3).reduce((a, s) => a + s.rpe, 0) / 3
    : null;

  // ─────────────────────────────────────────────────────────────
  // LOADING / ERROR
  // ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)' }}>
      <div>
        <div className="num pulse" style={{ fontSize: 64, color: 'var(--orange)', textAlign: 'center' }}>9KM</div>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '0.25em', textAlign: 'center', marginTop: 8 }}>CARICAMENTO DATI...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-base)', padding: 24 }}>
      <div style={{ ...card, maxWidth: 480, textAlign: 'center' }}>
        <div className="num" style={{ fontSize: 48, color: 'var(--orange)' }}>ERRORE</div>
        <p className="mono" style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 12, lineHeight: 1.6 }}>{error}</p>
        <p className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Controlla NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <main style={{ background: 'var(--bg-base)', minHeight: '100vh', padding: '24px' }}>

      {/* ══════ HEADER ══════ */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        flexWrap: 'wrap',
        gap: 16,
        marginBottom: 28,
      }}>
        {/* Title */}
        <div className="fade-up">
          <div className="mono" style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: '0.28em', marginBottom: 6 }}>
            PREPARAZIONE CORSA
          </div>
          <h1 className="num" style={{ fontSize: 56, lineHeight: 1, color: 'var(--text)' }}>
            9KM × 150D+
          </h1>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
            25 GIUGNO 2026 &nbsp;·&nbsp; MISTO ASFALTO / TRAIL / BOSCO
          </div>
        </div>

        {/* Countdown */}
        <div className="fade-up" style={{
          ...card,
          border: '1px solid rgba(255,77,31,0.25)',
          background: 'rgba(255,77,31,0.04)',
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          padding: '16px 24px',
        }}>
          <CountdownUnit value={countdown.d} label="GIORNI" />
          <div style={{ width: 1, height: 40, background: 'var(--border-bright)' }} />
          <CountdownUnit value={countdown.h} label="ORE" />
          <CountdownUnit value={countdown.m} label="MIN" />
          <CountdownUnit value={countdown.s} label="SEC" />
        </div>
      </header>

      {/* ══════ KPI CARDS ══════ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10,
        marginBottom: 20,
      }}>
        {[
          {
            tag: 'SESSIONI LOG',
            val: `${sessions.length}`,
            sub: `/ ${uscite.length} pianificate`,
            color: 'var(--blue)',
          },
          {
            tag: 'KM TOTALI',
            val: totalKm.toFixed(1),
            sub: 'km completati',
            color: 'var(--green)',
          },
          {
            tag: 'BEST PACE',
            val: bestPace ? fmtPace(bestPace) : '—',
            sub: '/km',
            color: 'var(--orange)',
          },
          {
            tag: 'WALK BREAKS',
            val: lastS ? (parseWB(lastS.walk_breaks) ?? '—').toString() : '—',
            sub: 'ultima sessione',
            color: parseWB(lastS?.walk_breaks) === 0 ? 'var(--green)' : 'var(--yellow)',
          },
          {
            tag: 'RPE MEDIO',
            val: avgRpe.toFixed(1),
            sub: '/ 10',
            color: avgRpe >= 8.5 ? 'var(--orange)' : 'var(--blue)',
          },
          {
            tag: 'SETTIMANA',
            val: `${planByWeek.filter(w => {
              const now2 = new Date();
              return w.meta && new Date(w.meta.data_inizio) <= now2 && new Date(w.meta.data_fine) >= now2;
            })[0]?.week ?? '—'}`,
            sub: `di ${settimane.length} totali`,
            color: 'var(--text)',
          },
        ].map(({ tag, val, sub, color }) => (
          <div key={tag} style={{ ...card, padding: '14px 16px' }}>
            <div style={label}>{tag}</div>
            <div className="num" style={{ fontSize: 34, color, lineHeight: 1.1 }}>{val}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ══════ CHARTS ROW 1: Pace + RPE ══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 14, marginBottom: 14 }}>

        {/* Pace evolution */}
        <div style={card}>
          <SectionHeader tag="EVOLUZIONE PASSO" title="Passo medio per sessione" />
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 12 }}>
            ▬ target gara: 5:00–5:33/km &nbsp;&nbsp; (nota: include pause cammino)
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="paceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#FF4D1F" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#FF4D1F" stopOpacity={0}    />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: '#5A7090', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false} tickLine={false}
              />
              <YAxis
                domain={[4.5, 9.5]}
                tickFormatter={fmtPace}
                tick={{ fill: '#5A7090', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                axisLine={false} tickLine={false} width={42}
              />
              <Tooltip content={<ChartTooltip />} />
              {/* Target zone */}
              <ReferenceLine y={parsePace('5:00')!}  stroke="rgba(0,217,144,0.35)" strokeDasharray="5 4" label={{ value: '5:00', fill: '#00D990', fontSize: 9, fontFamily: 'JetBrains Mono', position: 'right' }} />
              <ReferenceLine y={parsePace('5:33')!}  stroke="rgba(0,217,144,0.2)"  strokeDasharray="5 4" label={{ value: '5:33', fill: '#5A7090', fontSize: 9, fontFamily: 'JetBrains Mono', position: 'right' }} />
              <Area
                type="monotone"
                dataKey="pace"
                name="Passo"
                stroke="#FF4D1F"
                strokeWidth={2.5}
                fill="url(#paceGrad)"
                dot={{ fill: '#FF4D1F', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: '#FF4D1F', stroke: 'rgba(255,77,31,0.3)', strokeWidth: 4 }}
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* RPE + Gambe */}
        <div style={card}>
          <SectionHeader tag="FATICA" title="RPE + Sensazione gambe" />
          <ResponsiveContainer width="100%" height={216}>
            <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#5A7090', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fill: '#5A7090', fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={8} stroke="rgba(255,77,31,0.25)" strokeDasharray="4 3" />
              <Bar dataKey="rpe"   name="RPE"   fill="#3A7EFF" radius={[3,3,0,0]} maxBarSize={20} />
              <Bar dataKey="gambe" name="Gambe" fill="rgba(58,126,255,0.3)" radius={[3,3,0,0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ══════ CHARTS ROW 2: Walk Breaks + Distanza ══════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>

        {/* Walk Breaks */}
        <div style={card}>
          <SectionHeader tag="WALK BREAKS" title="Progressione pause" />
          <div className="mono" style={{ fontSize: 10, color: 'var(--green)', marginBottom: 12 }}>
            ↘ trend in miglioramento · obiettivo: zero
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={wbChartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#5A7090', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 5]} ticks={[0,1,2,3,4,5]} tick={{ fill: '#5A7090', fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={0} stroke="rgba(0,217,144,0.4)" />
              <Bar dataKey="wb" name="Walk Breaks" radius={[3,3,0,0]} maxBarSize={40}>
                {wbChartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.wb === 0 ? '#00D990' : d.wb! <= 1 ? '#FFC93C' : d.wb! <= 2 ? '#FF9B3D' : '#FF4D1F'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distanza per sessione */}
        <div style={card}>
          <SectionHeader tag="DISTANZA" title="Km per sessione" />
          <div className="mono" style={{ fontSize: 10, color: 'var(--yellow)', marginBottom: 12 }}>
            ▬ obiettivo gara: 9 km
          </div>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#5A7090', fontSize: 10, fontFamily: 'JetBrains Mono' }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 10]} tick={{ fill: '#5A7090', fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
              <Tooltip content={<ChartTooltip />} />
              <ReferenceLine y={9} stroke="rgba(255,201,60,0.4)" strokeDasharray="5 4"
                label={{ value: '9km', fill: '#FFC93C', fontSize: 9, fontFamily: 'JetBrains Mono', position: 'insideTopLeft' }}
              />
              <Bar dataKey="km" name="Km" radius={[3,3,0,0]} maxBarSize={40}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.km >= 9 ? '#00D990' : d.km >= 6 ? '#3A7EFF' : 'rgba(58,126,255,0.5)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ══════ PIANO SETTIMANALE ══════ */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SectionHeader tag="PIANO DI ALLENAMENTO" title="Settimane 1–6 → Gara 25 Giugno" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {planByWeek.map(({ week, meta, items }) => {
            const nowD     = new Date();
            const start    = meta ? new Date(meta.data_inizio) : null;
            const end      = meta ? new Date(meta.data_fine)   : null;
            const isCurrent = start && end && nowD >= start && nowD <= end;
            const isPast    = end && nowD > end;
            const isRace    = week === 6;
            const doneCount = items.filter(i => i.done).length;
            const pct       = Math.round((doneCount / items.length) * 100);

            return (
              <div key={week} style={{
                border: `1px solid ${isCurrent ? 'var(--orange)' : isRace ? 'rgba(0,217,144,0.35)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '14px 14px',
                background: isCurrent ? 'var(--orange-glow)' : isRace ? 'var(--green-dim)' : 'transparent',
                opacity: !isPast && !isCurrent && !isRace ? 0.55 : 1,
                transition: 'opacity 0.2s',
              }}>
                {/* Week header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span className="num" style={{
                      fontSize: 28,
                      color: isRace ? 'var(--green)' : isCurrent ? 'var(--orange)' : isPast ? 'var(--text)' : 'var(--text-dim)',
                    }}>
                      S{week}
                    </span>
                    {isCurrent && <Badge text="ORA" color="white"     bg="var(--orange)" />}
                    {isRace    && <Badge text="GARA" color="#000"     bg="var(--green)"  />}
                    {isPast && !isCurrent && <Badge text="OK" color="var(--green)" bg="var(--green-dim)" />}
                  </div>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    {doneCount}/{items.length}
                  </span>
                </div>

                {/* Obiettivo */}
                {meta && (
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.4, minHeight: 32 }}>
                    {meta.obiettivo}
                  </div>
                )}

                {/* Progress bar */}
                <div style={{ height: 3, background: 'var(--text-muted)', borderRadius: 2, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: isRace ? 'var(--green)' : isCurrent ? 'var(--orange)' : 'var(--blue)',
                    borderRadius: 2,
                    transition: 'width 0.6s ease',
                  }} />
                </div>

                {/* Session dots */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {items.map(u => (
                    <div
                      key={u.id_key}
                      title={u.contenuto.substring(0, 80) + '…'}
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: u.done ? (isRace ? 'var(--green)' : 'var(--green)') : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${u.done ? 'transparent' : 'var(--border)'}`,
                        cursor: 'default',
                      }}
                    >
                      <span className="mono" style={{
                        fontSize: 10,
                        color: u.done ? '#000' : 'var(--text-dim)',
                        fontWeight: 600,
                      }}>
                        {u.numero_uscita}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Dates */}
                {meta && (
                  <div className="mono" style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 8 }}>
                    {fmtDate(meta.data_inizio)} → {fmtDate(meta.data_fine)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════ SESSION LOG ══════ */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SectionHeader tag="LOG SESSIONI" title={`${sessions.length} uscite completate`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['DATA','SESSIONE','KM','PASSO','TEMPO','RPE','GAMBE','WALK','D+','NOTE'].map(h => (
                  <th key={h} style={{
                    padding: '8px 12px',
                    textAlign: 'left',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: 9,
                    color: 'var(--text-dim)',
                    letterSpacing: '0.15em',
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                    fontWeight: 500,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...sessions].reverse().map((s, idx) => {
                const u   = s.id_uscita_piano ? usciteMap[s.id_uscita_piano] : null;
                const wb  = parseWB(s.walk_breaks);
                const p   = parsePace(s.passo_medio);
                const fast = p !== null && p <= parsePace('5:33')!;
                return (
                  <tr
                    key={s.id}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.025)', transition: 'background 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Data */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fmtDate(s.data)}</span>
                    </td>
                    {/* Sessione */}
                    <td style={{ padding: '10px 12px' }}>
                      {u
                        ? <span className="mono" style={{ fontSize: 11, background: 'var(--blue-dim)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>S{s.week}.{u.numero_uscita}</span>
                        : <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>S{s.week}</span>
                      }
                    </td>
                    {/* Km */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="num" style={{ fontSize: 22, color: 'var(--text)' }}>{parseFloat(s.distanza_km).toFixed(2)}</span>
                    </td>
                    {/* Passo */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="mono" style={{ fontSize: 13, color: fast ? 'var(--green)' : 'var(--text)', fontWeight: 500 }}>
                        {s.passo_medio ?? '—'}/km
                      </span>
                    </td>
                    {/* Tempo */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.tempo_totale}</span>
                    </td>
                    {/* RPE */}
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 28, height: 28, borderRadius: 6,
                        background: s.rpe >= 9 ? 'rgba(255,77,31,0.2)' : s.rpe <= 6 ? 'rgba(0,217,144,0.2)' : 'rgba(255,201,60,0.15)',
                        color:      s.rpe >= 9 ? 'var(--orange)'      : s.rpe <= 6 ? 'var(--green)'         : 'var(--yellow)',
                      }}>
                        <span className="num" style={{ fontSize: 18 }}>{s.rpe}</span>
                      </span>
                    </td>
                    {/* Gambe */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="num" style={{ fontSize: 22, color: s.gambe >= 8 ? 'var(--orange)' : 'var(--text-dim)' }}>
                        {s.gambe}
                      </span>
                    </td>
                    {/* Walk breaks */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="mono" style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: wb === 0 ? 'var(--green)' : wb === null ? 'var(--text-muted)' : wb <= 1 ? 'var(--yellow)' : 'var(--orange)',
                      }}>
                        {wb === null ? '—' : wb === 0 ? '✓ 0' : `×${wb}`}
                      </span>
                    </td>
                    {/* D+ */}
                    <td style={{ padding: '10px 12px' }}>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                        {s.dislivello_m ? `+${s.dislivello_m}m` : '—'}
                      </span>
                    </td>
                    {/* Note (troncata) */}
                    <td style={{ padding: '10px 12px', maxWidth: 200 }}>
                      {s.note && (
                        <span title={s.note} style={{ fontSize: 11, color: 'var(--text-dim)', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {s.note}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════ PROSSIMA SESSIONE ══════ */}
      {nextUscita && (
        <div style={{
          ...card,
          border: '1px solid rgba(255,77,31,0.35)',
          background: 'var(--orange-glow)',
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 20,
        }}>
          {/* Glow */}
          <div style={{
            position: 'absolute', top: -60, right: -60,
            width: 240, height: 240,
            background: 'radial-gradient(circle, rgba(255,77,31,0.07) 0%, transparent 65%)',
            pointerEvents: 'none',
          }} />

          <div className="mono" style={{ fontSize: 10, color: 'var(--orange)', letterSpacing: '0.2em', marginBottom: 10 }}>
            PROSSIMA SESSIONE
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            {/* Label */}
            <div>
              <div className="num" style={{ fontSize: 64, lineHeight: 1, color: 'var(--text)' }}>
                S{nextUscita.settimana}.{nextUscita.numero_uscita}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                {settimaneMap[nextUscita.settimana]?.obiettivo}
              </div>
              {settimaneMap[nextUscita.settimana] && (
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                  {fmtDate(settimaneMap[nextUscita.settimana].data_inizio)} →{' '}
                  {fmtDate(settimaneMap[nextUscita.settimana].data_fine)}
                </div>
              )}
            </div>

            {/* Content */}
            <div style={{
              flex: 1,
              minWidth: 260,
              background: 'rgba(255,255,255,0.03)',
              borderRadius: 8,
              padding: '14px 18px',
              borderLeft: '3px solid var(--orange)',
            }}>
              <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-line' }}>
                {nextUscita.contenuto}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ RACE DAY STRATEGY ══════ */}
      <div style={{ ...card, marginBottom: 20 }}>
        <SectionHeader tag="STRATEGIA GARA — 25 GIUGNO" title="9km × 150D+ · Target: 45–50 min" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          {[
            {
              icon: '🚀',
              title: 'Partenza',
              color: 'var(--orange)',
              text: 'Parti subito a 5:20–5:30/km. Il passo lento crea lattato ai polpacci. Non frenare i primi km.',
            },
            {
              icon: '⛰️',
              title: 'Salita',
              color: 'var(--yellow)',
              text: 'Mantieni la potenza. Accorcia il passo ma non rallentare oltre 5:50/km. Respira.',
            },
            {
              icon: '⬇️',
              title: 'Discesa',
              color: 'var(--green)',
              text: 'Recupera in discesa. Alloca le energie per il finale. Lascia correre le gambe.',
            },
            {
              icon: '💧',
              title: 'Idratazione',
              color: 'var(--blue)',
              text: '500ml almeno 1h prima della gara. Caldo e disidratazione impattano molto la tua performance.',
            },
          ].map(({ icon, title, color, text }) => (
            <div key={title} style={{
              padding: '14px 16px',
              border: '1px solid var(--border)',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.015)',
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color, marginBottom: 6 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>{text}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════ FOOTER ══════ */}
      <footer style={{
        paddingTop: 16,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
      }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.15em' }}>
          RUNNING DASHBOARD v1.0 · SUPABASE LIVE
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          AGGIORNATO {now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })} {now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </footer>

    </main>
  );
}
