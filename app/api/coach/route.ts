import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildCoachContext,
  buildCoachResponse,
  buildCoachSystemPrompt,
  type CoachRequest,
  type CoachResponse,
  type SessionRow,
  type SettimanaRow,
  type UscitaRow,
} from '@/lib/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function parseRequest(body: unknown): CoachRequest {
  if (!body || typeof body !== 'object') {
    return { request_type: 'analyze_last_runs' };
  }

  const requestType = (body as { request_type?: string }).request_type;
  const userMessage = (body as { user_message?: string }).user_message;

  const allowed = new Set([
    'analyze_last_runs',
    'pre_race_brief',
    'update_plan',
    'post_run_review',
  ]);

  return {
    request_type: allowed.has(requestType ?? '') ? (requestType as CoachRequest['request_type']) : 'analyze_last_runs',
    user_message: typeof userMessage === 'string' && userMessage.trim() ? userMessage.trim() : undefined,
  };
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';

  const asAny = value as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>;
    }>;
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const fromOutput = asAny.output?.flatMap((item) => item.content ?? [])
    .map((item) => item.text ?? '')
    .join('\n');
  if (fromOutput) return fromOutput;

  const fromChoices = asAny.choices?.[0]?.message?.content;
  if (typeof fromChoices === 'string') return fromChoices;
  if (Array.isArray(fromChoices)) {
    return fromChoices.map((part) => part.text ?? '').join('\n');
  }

  return '';
}

function parseJsonResponse(content: string): CoachResponse | null {
  const trimmed = content.trim();
  const cleaned = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  try {
    const parsed = JSON.parse(cleaned) as CoachResponse;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function callOpenAI(context: ReturnType<typeof buildCoachContext>): Promise<CoachResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return buildCoachResponse(context);
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildCoachSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify({
            coach_context: context,
            output_shape: {
              request_type: 'analyze_last_runs | pre_race_brief | update_plan | post_run_review',
              summary: 'string',
              risk_level: 'low | medium | high',
              key_points: ['string'],
              risks: ['string'],
              recommendation: 'string',
              next_session: 'object | null',
              change_proposal: 'object | null',
              pre_run_brief: 'object | null',
              plan_changes: [{ title: 'string', detail: 'string' }],
              source: {
                sessions_considered: 0,
                latest_session_label: 'string | null',
                next_session_label: 'string | null',
                current_week: 0,
              },
            },
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = await response.json();
  const content = extractText(json);
  const parsed = parseJsonResponse(content);
  return parsed ?? buildCoachResponse(context);
}

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: 'Missing Supabase environment variables.' },
      { status: 500 },
    );
  }

  const body = parseRequest(await request.json().catch(() => null));
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [sessionsResult, usciteResult, settimaneResult] = await Promise.all([
    supabase.from('preparazione_corsa_9km').select('*').order('data', { ascending: true }),
    supabase.from('uscite_piano').select('*').order('settimana', { ascending: true }).order('numero_uscita', { ascending: true }),
    supabase.from('piano_settimane').select('*').order('settimana', { ascending: true }),
  ]);

  if (sessionsResult.error || usciteResult.error || settimaneResult.error) {
    return NextResponse.json(
      {
        error: 'Errore nel caricamento dei dati da Supabase.',
        details: {
          sessions: sessionsResult.error?.message ?? null,
          uscite: usciteResult.error?.message ?? null,
          settimane: settimaneResult.error?.message ?? null,
        },
      },
      { status: 500 },
    );
  }

  const context = buildCoachContext({
    request_type: body.request_type,
    user_message: body.user_message,
    sessions: (sessionsResult.data ?? []) as SessionRow[],
    uscite: (usciteResult.data ?? []) as UscitaRow[],
    settimane: (settimaneResult.data ?? []) as SettimanaRow[],
  });

  try {
    const result = await callOpenAI(context);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(buildCoachResponse(context));
  }
}
