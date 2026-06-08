import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SessionWritebackPatch } from '@/lib/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePatch(value: unknown): SessionWritebackPatch | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const patch: SessionWritebackPatch = {};

  if (isString(input.data) && input.data.trim()) patch.data = input.data.trim();
  if (isNumber(input.week)) patch.week = input.week;
  if (isString(input.distanza_km) && input.distanza_km.trim()) patch.distanza_km = input.distanza_km.trim();
  if (isString(input.tempo_totale) && input.tempo_totale.trim()) patch.tempo_totale = input.tempo_totale.trim();
  if (isString(input.passo_medio) && input.passo_medio.trim()) patch.passo_medio = input.passo_medio.trim();
  if (Object.prototype.hasOwnProperty.call(input, 'splits')) patch.splits = isString(input.splits) ? input.splits.trim() || null : null;
  if (Object.prototype.hasOwnProperty.call(input, 'walk_breaks')) patch.walk_breaks = isString(input.walk_breaks) ? input.walk_breaks.trim() || null : null;
  if (Object.prototype.hasOwnProperty.call(input, 'dislivello_m')) patch.dislivello_m = isNumber(input.dislivello_m) ? input.dislivello_m : null;
  if (isNumber(input.gambe)) patch.gambe = input.gambe;
  if (isNumber(input.rpe)) patch.rpe = input.rpe;
  if (Object.prototype.hasOwnProperty.call(input, 'note')) patch.note = isString(input.note) ? input.note.trim() || null : null;

  return Object.keys(patch).length ? patch : null;
}

function normalizeDate(value: string) {
  return value.includes('T') ? value.split('T')[0] : value;
}

function findPlannedSessionId(params: {
  supabase: ReturnType<typeof createClient>;
  week: number;
}) {
  const { supabase, week } = params;
  return supabase
    .from('uscite_piano')
    .select('id_key, settimana, numero_uscita, contenuto, piano_settimane!inner(settimana, data_inizio, data_fine)')
    .eq('settimana', week)
    .order('numero_uscita', { ascending: true });
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        error: 'Missing Supabase service role configuration.',
        details: 'Set SUPABASE_SERVICE_ROLE_KEY in the environment.',
      },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const fields = (body as { fields?: unknown }).fields;
  const patch = parsePatch(fields);
  if (!patch?.data || !patch.week || !patch.distanza_km || !patch.tempo_totale || !patch.passo_medio) {
    return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const plannedResult = await findPlannedSessionId({
    supabase,
    week: patch.week,
  });

  if (plannedResult.error) {
    return NextResponse.json(
      {
        error: 'Could not resolve planned session.',
        details: plannedResult.error.message,
      },
      { status: 500 },
    );
  }

  const plannedSessions = plannedResult.data ?? [];
  const nextPlanned = plannedSessions[0] ?? null;
  const insertPayload = {
    data: normalizeDate(patch.data),
    week: patch.week,
    distanza_km: patch.distanza_km,
    tempo_totale: patch.tempo_totale,
    passo_medio: patch.passo_medio,
    splits: patch.splits ?? null,
    walk_breaks: patch.walk_breaks ?? null,
    dislivello_m: patch.dislivello_m ?? null,
    gambe: patch.gambe ?? 0,
    rpe: patch.rpe ?? 0,
    note: patch.note ?? null,
    id_uscita_piano: nextPlanned?.id_key ?? null,
  };

  const insertResult = await supabase
    .from('preparazione_corsa_9km')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertResult.error) {
    return NextResponse.json(
      {
        error: 'Insert failed.',
        details: insertResult.error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    session: insertResult.data,
    matched_plan: nextPlanned
      ? {
          id_key: nextPlanned.id_key,
          settimana: nextPlanned.settimana,
          numero_uscita: nextPlanned.numero_uscita,
        }
      : null,
  });
}
