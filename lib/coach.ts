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
}

export interface CoachAction {
  title: string;
  detail: string;
}

export interface CoachResponse {
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

export function buildCoachResponse(context: CoachContext): CoachResponse {
  const sortedSessions = [...context.sessions].sort(
    (a, b) => parseLocalDate(a.data).getTime() - parseLocalDate(b.data).getTime(),
  );
  const lastSession = sortedSessions.at(-1) ?? null;
  const lastThree = sortedSessions.slice(-3);
  const avgRpe = lastThree.length
    ? lastThree.reduce((sum, s) => sum + s.rpe, 0) / lastThree.length
    : 0;
  const avgLegs = lastThree.length
    ? lastThree.reduce((sum, s) => sum + s.gambe, 0) / lastThree.length
    : 0;
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

  const riskScore =
    (avgRpe >= 8.5 ? 2 : avgRpe >= 7.5 ? 1 : 0) +
    (avgLegs >= 8 ? 2 : avgLegs >= 7 ? 1 : 0) +
    (wbTrend.length > 1 && wbTrend[wbTrend.length - 1] > wbTrend[0] ? 1 : 0) +
    (latestPace !== null && targetPace !== null && latestPace > targetPace + 0.4 ? 1 : 0);

  const riskLevel: CoachResponse['risk_level'] =
    riskScore >= 4 ? 'high' : riskScore >= 2 ? 'medium' : 'low';

  const keyPoints = [
    lastThree.length
      ? `Ultime 3 uscite: ${totalKmLastThree.toFixed(1)} km, RPE medio ${avgRpe.toFixed(1)}, gambe ${avgLegs.toFixed(1)}.`
      : 'Non ci sono ancora abbastanza sessioni recenti per fare un trend robusto.',
    latestWB !== null
      ? `Walk breaks nell'ultima uscita: ${latestWB}.`
      : `Nell'ultima uscita non ci sono walk breaks leggibili.`,
    latestPace !== null
      ? `Passo medio dell'ultima uscita: ${fmtPace(latestPace)}/km.`
      : 'Passo medio ultima uscita non disponibile.',
  ];

  const risks: string[] = [];
  if (avgRpe >= 8) risks.push('Carico percepito alto nelle ultime uscite.');
  if (avgLegs >= 8) risks.push('Le gambe stanno arrivando molto cariche a fine seduta.');
  if (latestWB !== null && latestWB > 0) risks.push('Le pause cammino non sono ancora completamente stabilizzate.');
  if (latestPace !== null && targetPace !== null && latestPace > targetPace + 0.3) {
    risks.push('Il passo medio recente è più lento del target gara.');
  }
  if (!risks.length) risks.push('Nessun segnale critico evidente nel breve periodo.');

  const recommendation =
    context.request_type === 'pre_race_brief'
      ? 'Parti controllato ma non piano: entra subito nel ritmo previsto, con warm-up dinamico e focus sui polpacci.'
      : context.request_type === 'update_plan'
        ? 'Il piano va mantenuto aggressivo ma con recuperi walk e attenzione al carico percepito.'
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

  const preRunBrief =
    context.request_type === 'pre_race_brief' || context.request_type === 'post_run_review'
      ? {
          warmup: 'Mobilità dinamica breve, qualche allungo progressivo e niente jogging lento prolungato.',
          target:
            context.request_type === 'pre_race_brief'
              ? 'Entra subito nel ritmo utile senza aspettare troppo: il lento iniziale ti penalizza.'
              : 'Confronta la seduta con il target previsto e cerca coerenza, non perfezione.',
          rules: [
            'Se i polpacci si irrigidiscono, non forzare l’inerzia.',
            'Usa walk recovery vera, non trotto.',
            'Se il caldo è alto, abbassa le ambizioni di passo ma non la qualità del lavoro.',
          ],
        }
      : null;

  const latestLabel = lastSession
    ? `S${lastSession.week}.${lastSession.id_uscita_piano ? usciteByKey[lastSession.id_uscita_piano]?.numero_uscita ?? '?' : '?'}`
    : null;

  return {
    request_type: context.request_type,
    summary:
      context.request_type === 'analyze_last_runs'
        ? 'Sto leggendo i trend recenti e il pattern di carico per capire se il piano sta funzionando davvero.'
        : context.request_type === 'pre_race_brief'
          ? 'Ti preparo un briefing operativo prima della corsa, con focus su partenza, warm-up e gestione del ritmo.'
          : context.request_type === 'update_plan'
            ? 'Sto valutando se il piano va mantenuto, leggermente corretto o alleggerito.'
            : 'Sto confrontando la sessione con l’obiettivo previsto per decidere il passo successivo.',
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
  return [
    'Sei un running coach e athletic trainer per Ale.',
    'Rispondi in italiano, in modo concreto, diretto e sintetico.',
    'Non usare tono generico: analizza i dati reali e proponi azioni operative.',
    'Evita slow jogging come default se il contesto mostra che peggiora i polpacci.',
    'Usa walk recovery quando serve e alza il rischio in presenza di segnali anomali.',
    'Restituisci solo JSON valido e aderente alla struttura richiesta.',
  ].join(' ');
}
