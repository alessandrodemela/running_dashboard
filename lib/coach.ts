export type CoachRequestType =
  | 'analyze_last_runs'
  | 'pre_race_brief'
  | 'update_plan'
  | 'post_run_review';

export interface SessionRow {
  id: number;
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
  id_uscita_piano: string | null;
}

export interface UscitaRow {
  id_key: string;
  settimana: number;
  numero_uscita: number;
  contenuto: string;
}

export interface SettimanaRow {
  settimana: number;
  obiettivo: string;
  data_inizio: string;
  data_fine: string;
}

export interface CoachRequest {
  request_type: CoachRequestType;
  user_message?: string;
  provider?: 'auto' | 'openai' | 'anthropic' | 'local';
  model?: string;
}

export interface CoachAction {
  title: string;
  detail: string;
}

export interface PlanChangeProposal {
  operation: 'replace_content';
  target_id: string;
  target_label: string;
  before: string;
  after: string;
  reason: string;
  confidence: number;
  requires_confirmation: boolean;
}

export interface CoachResponse {
  provider: 'openai' | 'anthropic' | 'local';
  request_type: CoachRequestType;
  summary: string;
  risk_level: 'low' | 'medium' | 'high';
  key_points: string[];
  risks: string[];
  recommendation: string;
  next_session: {
    label: string;
    content: string;
  } | null;
  change_proposal: PlanChangeProposal | null;
  pre_run_brief: {
    warmup: string;
    target: string;
    rules: string[];
  } | null;
  plan_changes: CoachAction[];
  source: {
    sessions_considered: number;
    latest_session_label: string | null;
    next_session_label: string | null;
    current_week: number | null;
  };
}

export interface CoachContext {
  request_type: CoachRequestType;
  user_message?: string;
  now: string;
  race_date: string;
  athlete_name: string;
  race_goal: string;
  focus_rules: string[];
  sessions: SessionRow[];
  uscite: UscitaRow[];
  settimane: SettimanaRow[];
}

export interface SessionWritebackPatch {
  data?: string;
  week?: number;
  distanza_km?: string;
  tempo_totale?: string;
  passo_medio?: string;
  splits?: string | null;
  walk_breaks?: string | null;
  dislivello_m?: number | null;
  gambe?: number;
  rpe?: number;
  note?: string | null;
  id_uscita_piano?: string | null;
}

export const RACE_DATE_ISO = '2026-06-25T09:00:00';

export const parsePace = (p: string | null): number | null => {
  if (!p) return null;
  const parts = p.split(':');
  if (parts.length !== 2) return null;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return minutes + seconds / 60;
};

export const fmtPace = (value: number): string => {
  const minutes = Math.floor(value);
  const seconds = Math.round((value - minutes) * 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

export const parseWB = (wb: string | null): number | null => {
  if (wb === null || wb === undefined) return null;
  const value = Number.parseInt(wb.toString().split('/')[0], 10);
  return Number.isNaN(value) ? null : value;
};

export const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const fmtDate = (value: string) =>
  parseLocalDate(value).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'short',
  });

export const average = (values: number[]) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export const formatDelta = (value: number | null, unit: string) => {
  if (value === null || Number.isNaN(value)) return 'n/d';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}${unit}`;
};

export function buildCoachContext(input: {
  request_type: CoachRequestType;
  user_message?: string;
  sessions: SessionRow[];
  uscite: UscitaRow[];
  settimane: SettimanaRow[];
  now?: Date;
}): CoachContext {
  return {
    request_type: input.request_type,
    user_message: input.user_message,
    now: (input.now ?? new Date()).toISOString(),
    race_date: RACE_DATE_ISO,
    athlete_name: 'Ale',
    race_goal: '9km con 150m D+ in 45-50 minuti',
    focus_rules: [
      'Niente slow jog come warm-up se peggiora la sensazione ai polpacci.',
      'Walk recovery preferita tra le ripetute.',
      'Se il caldo peggiora i dati, riduci carico o cambia timing.',
      'Se il pacing parte troppo piano, correggi subito.',
      'Dolore, peggioramento netto o segnali anomali alzano il rischio.',
    ],
    sessions: input.sessions,
    uscite: input.uscite,
    settimane: input.settimane,
  };
}

export function buildCoachResponse(
  context: CoachContext,
  provider: CoachResponse['provider'] = 'local',
): CoachResponse {
  const sortedSessions = [...context.sessions].sort(
    (a, b) => parseLocalDate(a.data).getTime() - parseLocalDate(b.data).getTime(),
  );
  const lastSession = sortedSessions.at(-1) ?? null;
  const totalKmAll = sortedSessions.reduce((sum, s) => sum + Number(s.distanza_km || '0'), 0);
  const paceValuesAll = sortedSessions.map((s) => parsePace(s.passo_medio)).filter((v): v is number => v !== null);
  const avgPaceAll = average(paceValuesAll);
  const avgRpeAll = average(sortedSessions.map((s) => s.rpe));
  const avgLegsAll = average(sortedSessions.map((s) => s.gambe));
  const wbValuesAll = sortedSessions.map((s) => parseWB(s.walk_breaks)).filter((v): v is number => v !== null);
  const avgWbAll = average(wbValuesAll);
  const recentWindow = sortedSessions.slice(-5);
  const previousWindow = sortedSessions.slice(Math.max(0, sortedSessions.length - 10), Math.max(0, sortedSessions.length - 5));
  const recentPaceAvg = average(recentWindow.map((s) => parsePace(s.passo_medio)).filter((v): v is number => v !== null));
  const previousPaceAvg = average(previousWindow.map((s) => parsePace(s.passo_medio)).filter((v): v is number => v !== null));
  const recentRpeAvg = average(recentWindow.map((s) => s.rpe));
  const previousRpeAvg = average(previousWindow.map((s) => s.rpe));
  const recentLegsAvg = average(recentWindow.map((s) => s.gambe));
  const previousLegsAvg = average(previousWindow.map((s) => s.gambe));
  const recentWbAvg = average(recentWindow.map((s) => parseWB(s.walk_breaks)).filter((v): v is number => v !== null));
  const previousWbAvg = average(previousWindow.map((s) => parseWB(s.walk_breaks)).filter((v): v is number => v !== null));
  const lastThree = sortedSessions.slice(-3);
  const avgRpe = average(lastThree.map((s) => s.rpe)) ?? 0;
  const avgLegs = average(lastThree.map((s) => s.gambe)) ?? 0;
  const wbTrend = lastThree.map((s) => parseWB(s.walk_breaks)).filter((v): v is number => v !== null);
  const totalKmLastThree = lastThree.reduce((sum, s) => sum + Number(s.distanza_km || '0'), 0);
  const currentWeek = context.settimane.find(({ data_inizio, data_fine }) => {
    const now = new Date(context.now);
    return now >= parseLocalDate(data_inizio) && now <= parseLocalDate(data_fine);
  })?.settimana ?? null;

  const usciteByKey = Object.fromEntries(context.uscite.map((u) => [u.id_key, u]));
  const completedIds = new Set(sortedSessions.map((s) => s.id_uscita_piano).filter(Boolean));

  const nextSession =
    (() => {
      const lastLoggedUscita = lastSession?.id_uscita_piano ? usciteByKey[lastSession.id_uscita_piano] : null;

      if (lastLoggedUscita) {
        return context.uscite
          .filter(
            (u) =>
              u.settimana > lastLoggedUscita.settimana ||
              (u.settimana === lastLoggedUscita.settimana && u.numero_uscita > lastLoggedUscita.numero_uscita),
          )
          .sort((a, b) => a.settimana - b.settimana || a.numero_uscita - b.numero_uscita)
          .find((u) => !completedIds.has(u.id_key)) ?? null;
      }

      return context.uscite
        .filter((u) => currentWeek === null || u.settimana >= currentWeek)
        .sort((a, b) => a.settimana - b.settimana || a.numero_uscita - b.numero_uscita)
        .find((u) => !completedIds.has(u.id_key)) ?? null;
    })();

  const latestPace = parsePace(lastSession?.passo_medio ?? null);
  const targetPace = parsePace('5:33');
  const latestWB = parseWB(lastSession?.walk_breaks ?? null);
  const paceImprovement = previousPaceAvg !== null && recentPaceAvg !== null ? previousPaceAvg - recentPaceAvg : null;
  const rpeChange = previousRpeAvg !== null && recentRpeAvg !== null ? recentRpeAvg - previousRpeAvg : null;
  const legsChange = previousLegsAvg !== null && recentLegsAvg !== null ? recentLegsAvg - previousLegsAvg : null;
  const wbChange = previousWbAvg !== null && recentWbAvg !== null ? recentWbAvg - previousWbAvg : null;

  const riskScore =
    (avgRpeAll !== null && avgRpeAll >= 8.5 ? 2 : avgRpeAll !== null && avgRpeAll >= 7.5 ? 1 : 0) +
    (avgLegsAll !== null && avgLegsAll >= 8 ? 2 : avgLegsAll !== null && avgLegsAll >= 7 ? 1 : 0) +
    (wbChange !== null && wbChange > 0 ? 1 : 0) +
    (paceImprovement !== null && paceImprovement < 0 ? 1 : 0) +
    (latestPace !== null && targetPace !== null && latestPace > targetPace + 0.4 ? 1 : 0);

  const riskLevel: CoachResponse['risk_level'] =
    riskScore >= 4 ? 'high' : riskScore >= 2 ? 'medium' : 'low';

  const keyPoints = [
    sortedSessions.length
      ? `Storico completo: ${sortedSessions.length} uscite, ${totalKmAll.toFixed(1)} km totali, RPE medio ${avgRpeAll?.toFixed(1) ?? 'n/d'}, gambe ${avgLegsAll?.toFixed(1) ?? 'n/d'}.`
      : 'Non ci sono ancora sessioni sufficienti per una lettura di trend.',
    recentWindow.length
      ? `Ultime 5 vs precedenti: passo ${formatDelta(paceImprovement, '/km')}, RPE ${formatDelta(rpeChange, '' )}, gambe ${formatDelta(legsChange, '')}, walk breaks ${formatDelta(wbChange, '')}.`
      : 'Non ho abbastanza storico per un confronto recente affidabile.',
    latestWB !== null
      ? `Walk breaks nell'ultima uscita: ${latestWB}.`
      : `Nell'ultima uscita non ci sono walk breaks leggibili.`,
    avgPaceAll !== null
      ? `Passo medio storico: ${fmtPace(avgPaceAll)}/km.`
      : 'Passo medio storico non disponibile.',
  ];

  const risks: string[] = [];
  if (avgRpeAll !== null && avgRpeAll >= 8) risks.push('Carico percepito alto nello storico complessivo.');
  if (avgLegsAll !== null && avgLegsAll >= 8) risks.push('Le gambe stanno arrivando molto cariche a fine seduta.');
  if (rpeChange !== null && rpeChange > 0.5) risks.push('Le ultime uscite stanno pesando più delle precedenti.');
  if (wbChange !== null && wbChange > 0) risks.push('Le pause cammino stanno peggiorando nel blocco recente.');
  if (latestWB !== null && latestWB > 0) risks.push('Le pause cammino non sono ancora completamente stabilizzate.');
  if (latestPace !== null && targetPace !== null && latestPace > targetPace + 0.3) {
    risks.push('Il passo medio recente è più lento del target gara.');
  }
  if (!risks.length) risks.push('Nessun segnale critico evidente nel breve periodo.');

  const recommendation =
    context.request_type === 'pre_race_brief'
      ? 'Parti controllato ma non piano: entra subito nel ritmo previsto, con warm-up dinamico e focus sui polpacci.'
      : context.request_type === 'update_plan'
        ? 'Il piano va mantenuto ma regolato sul trend: usa l\'ultimo blocco per capire se alleggerire o consolidare.'
        : riskLevel === 'high'
          ? 'Ridurrei il carico della prossima uscita o lo trasformerei in seduta tecnica/controllata.'
          : riskLevel === 'medium'
            ? 'Prossima seduta ok, ma con obiettivo conservativo e monitoraggio stretto del warm-up e dei polpacci.'
            : 'Stato buono: si può proseguire con il piano, tenendo sotto controllo il pacing iniziale.';

  const planChanges: CoachAction[] = [];
  if (riskLevel === 'high') {
    planChanges.push({
      title: 'Taglio carico',
      detail: 'Riduci volume o intensità della prossima uscita e privilegia controllo e sensazioni.',
    });
  } else if (riskLevel === 'medium') {
    planChanges.push({
      title: 'Mantieni struttura',
      detail: 'Conserva la seduta prevista ma aggiungi un controllo più stretto sul primo blocco e sul recupero.',
    });
  } else {
    planChanges.push({
      title: 'Conferma piano',
      detail: 'La prossima uscita può restare invariata, con focus su pacing e continuità.',
    });
  }

  if (nextSession) {
    planChanges.push({
      title: `Prossima uscita S${nextSession.settimana}.${nextSession.numero_uscita}`,
      detail: 'Usala come riferimento operativo per il prossimo briefing pre-corsa.',
    });
  }

  const changeProposal: PlanChangeProposal | null =
    nextSession && (context.request_type === 'update_plan' || context.request_type === 'post_run_review')
      ? {
          operation: 'replace_content',
          target_id: nextSession.id_key,
          target_label: `S${nextSession.settimana}.${nextSession.numero_uscita}`,
          before: nextSession.contenuto,
          after: `${nextSession.contenuto}\n\nNota coach:\n${[
            riskLevel === 'high'
              ? '- Riduci il carico se il recupero resta incompleto.'
              : riskLevel === 'medium'
                ? '- Mantieni la struttura ma conserva il primo blocco più prudente.'
                : '- Conferma la struttura e tieni il focus sulla continuità.',
            '- Usa walk recovery vera, non trotto.',
            '- Non partire piano: entra nel ritmo utile con controllo.',
          ].join('\n')}`,
          reason:
            riskLevel === 'high'
              ? 'Carico recente alto: conviene alleggerire la prossima uscita.'
              : riskLevel === 'medium'
                ? 'Serve una correzione prudente del contenuto della prossima uscita.'
                : 'Il piano può restare quasi invariato con una nota operativa più chiara.',
          confidence: riskLevel === 'high' ? 0.86 : riskLevel === 'medium' ? 0.74 : 0.62,
          requires_confirmation: true,
        }
      : null;

  const preRunBrief =
    context.request_type === 'pre_race_brief' || context.request_type === 'post_run_review'
      ? {
          warmup: 'Mobilità dinamica breve, qualche allungo progressivo e niente jogging lento prolungato.',
          target:
            context.request_type === 'pre_race_brief'
              ? 'Entra subito nel ritmo utile senza aspettare troppo: il lento iniziale ti penalizza.'
              : 'Confronta la seduta con il target previsto e cerca coerenza, non perfezione.',
          rules: [
            'Se i polpacci si irrigidiscono, non forzare l\'inerzia.',
            'Usa walk recovery vera, non trotto.',
            'Se il caldo è alto, abbassa le ambizioni di passo ma non la qualità del lavoro.',
          ],
        }
      : null;

  const latestLabel = lastSession
    ? `S${lastSession.week}.${lastSession.id_uscita_piano ? usciteByKey[lastSession.id_uscita_piano]?.numero_uscita ?? '?' : '?'}`
    : null;

  return {
    provider,
    request_type: context.request_type,
    summary:
      context.request_type === 'analyze_last_runs'
        ? 'Sto leggendo lo storico completo e il trend recente per capire se il piano sta andando nella direzione giusta.'
        : context.request_type === 'pre_race_brief'
          ? 'Ti preparo un briefing operativo prima della corsa, con focus su partenza, warm-up e gestione del ritmo.'
          : context.request_type === 'update_plan'
            ? 'Sto valutando se il piano va mantenuto, leggermente corretto o alleggerito.'
            : 'Sto confrontando la sessione con l\'obiettivo previsto per decidere il passo successivo.',
    risk_level: riskLevel,
    key_points: keyPoints,
    risks,
    recommendation,
    next_session: nextSession
      ? {
          label: `S${nextSession.settimana}.${nextSession.numero_uscita}`,
          content: nextSession.contenuto,
        }
      : null,
    change_proposal: changeProposal,
    pre_run_brief: preRunBrief,
    plan_changes: planChanges,
    source: {
      sessions_considered: sortedSessions.length,
      latest_session_label: latestLabel,
      next_session_label: nextSession ? `S${nextSession.settimana}.${nextSession.numero_uscita}` : null,
      current_week: currentWeek,
    },
  };
}

export function buildCoachSystemPrompt() {
  return `Sei un running coach e athletic trainer per Ale. Rispondi SOLO con JSON valido, in italiano, concreto e sintetico.

### REGOLE CRITICHE — RISPETTA SEMPRE

1. **risk_level**: COPIA il valore da \`pre_calculated.risk_level\` nell'output. NON calcolarlo di nuovo. NON modificarlo. Deve essere identico.

2. **source**: COPIA il valore da \`pre_calculated.source\` nell'output. Non inventare valori.

3. **next_session**: Se \`pre_calculated.next_session\` è valorizzato, usalo direttamente. Se è null, metti null.

4. **change_proposal**: Popolato SOLO se request_type è "update_plan" o "post_run_review". Altrimenti SEMPRE null. Se pre_calculated ha una proposta, usala come base.

5. **pre_run_brief**: Popolato SOLO se request_type è "pre_race_brief" o "post_run_review". Altrimenti SEMPRE null.
   - Deve avere SEMPRE: warmup (string), target (string), rules (array di stringhe, almeno 3 elementi).
   - NON omettere il campo rules. NON restituire rules come stringa, deve essere un array.

6. **user_message**: Se \`coach_context.user_message\` è presente, consideralo come nota operativa dell'atleta.
   - Integra questa nota nel summary, nella recommendation e nel pre_run_brief.target.
   - È la voce dell'atleta: ha priorità sulle considerazioni generali.

7. **key_points e risks**: Scrivi analisi concrete basandoti sui dati in \`coach_context\` e sui pattern in \`pre_calculated.risk_metrics\`. Massimo 4 key_points, massimo 3 risks.

### STRUTTURA OUTPUT (JSON esatto):
{
  "provider": "anthropic",
  "request_type": "<copia da coach_context.request_type>",
  "summary": "<testo originale — commento analitico di 1-2 frasi>",
  "risk_level": "<COPIA ESATTA da pre_calculated.risk_level>",
  "key_points": ["<punto concreto 1>", "<punto concreto 2>"],
  "risks": ["<rischio 1>", "<rischio 2>"],
  "recommendation": "<raccomandazione operativa 1-2 frasi>",
  "next_session": <copia da pre_calculated.next_session oppure null>,
  "change_proposal": <copia da pre_calculated.change_proposal se applicabile, altrimenti null>,
  "pre_run_brief": <null oppure { "warmup": "...", "target": "...", "rules": ["...", "...", "..."] }>,
  "plan_changes": [{ "title": "...", "detail": "..." }],
  "source": <COPIA ESATTA da pre_calculated.source>
}

RESTITUISCI SOLO JSON VALIDO. Nessun testo prima o dopo.`;
}