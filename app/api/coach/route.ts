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

type Provider = CoachResponse['provider'];
type ProviderPreference = 'auto' | 'openai' | 'anthropic' | 'local';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function parseRequest(body: unknown): CoachRequest {
  if (!body || typeof body !== 'object') {
    return { request_type: 'analyze_last_runs', provider: 'auto' };
  }

  const requestType = (body as { request_type?: string }).request_type;
  const userMessage = (body as { user_message?: string }).user_message;
  const provider = (body as { provider?: string }).provider;
  const model = (body as { model?: string }).model;

  const allowed = new Set([
    'analyze_last_runs',
    'pre_race_brief',
    'update_plan',
    'post_run_review',
  ]);

  const allowedProviders = new Set(['auto', 'openai', 'anthropic', 'local']);

  return {
    request_type: allowed.has(requestType ?? '') ? (requestType as CoachRequest['request_type']) : 'analyze_last_runs',
    user_message: typeof userMessage === 'string' && userMessage.trim() ? userMessage.trim() : undefined,
    provider: allowedProviders.has(provider ?? '') ? (provider as ProviderPreference) : 'auto',
    model: typeof model === 'string' && model.trim() ? model.trim() : undefined,
  };
}

function parseJsonResponse(content: string): CoachResponse | null {
  const trimmed = content.trim();
  
  let jsonContent = trimmed;
  
  // Rimuovi ``` se presenti all'inizio
  if (jsonContent.startsWith('```')) {
    const match = jsonContent.match(/^```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      jsonContent = match[1].trim();
    }
  }

  try {
    // Prova a parsare tutto
    const parsed = JSON.parse(jsonContent) as CoachResponse;
    if (!parsed || typeof parsed !== 'object') return null;
    console.log('[coach] ✅ JSON parsed successfully');
    return parsed;
  } catch (err) {
    // Se fallisce, prova a estrarre solo il primo oggetto JSON valido
    console.warn('[coach] First parse attempt failed, trying to extract first JSON object...');
    
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}(?=\s*$|[\s\n]*$)/);
    if (!jsonMatch) {
      console.error('[coach] ❌ Could not extract JSON object');
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]) as CoachResponse;
      if (!parsed || typeof parsed !== 'object') return null;
      console.log('[coach] ✅ JSON extracted and parsed successfully');
      return parsed;
    } catch (extractErr) {
      console.error('[coach] ❌ Extract parse error:', extractErr instanceof Error ? extractErr.message : extractErr);
      console.log('[coach] Attempted JSON:', jsonMatch[0].substring(0, 300));
      return null;
    }
  }
}

function normalizeResponse(response: CoachResponse, provider: Provider, preCalculated?: CoachResponse): CoachResponse {
  return {
    ...response,
    provider: response.provider ?? provider,
    risk_level: preCalculated?.risk_level ?? response.risk_level,
    source: preCalculated?.source ?? response.source,
    pre_run_brief: response.pre_run_brief
      ? {
          warmup: response.pre_run_brief.warmup || preCalculated?.pre_run_brief?.warmup || 'Warm-up dinamico.',
          target: response.pre_run_brief.target || preCalculated?.pre_run_brief?.target || 'Mantieni il ritmo target.',
          rules: Array.isArray(response.pre_run_brief.rules) && response.pre_run_brief.rules.length > 0
            ? response.pre_run_brief.rules
            : preCalculated?.pre_run_brief?.rules || [],
        }
      : preCalculated?.pre_run_brief || null,
  };
}

function extractOpenAIText(value: unknown): string {
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

function extractAnthropicText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const asAny = value as { content?: Array<{ type?: string; text?: string }> };
  if (!Array.isArray(asAny.content)) return '';
  return asAny.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('\n');
}

function buildCoachPayload(
  context: ReturnType<typeof buildCoachContext>,
  preCalculated: CoachResponse,
) {
  return {
    coach_context: context,
    // Dati già calcolati lato server — NON ricalcolare, usali direttamente nell'output
    pre_calculated: {
      risk_level: preCalculated.risk_level,
      risk_metrics: preCalculated.key_points,
      risks: preCalculated.risks,
      source: preCalculated.source,
      next_session: preCalculated.next_session,
      change_proposal: preCalculated.change_proposal,
      pre_run_brief: preCalculated.pre_run_brief,
    },
    output_shape: {
      request_type: 'analyze_last_runs | pre_race_brief | update_plan | post_run_review',
      provider: 'anthropic',
      summary: 'string — scrivi il tuo commento analitico originale',
      risk_level: 'COPIA ESATTA da pre_calculated.risk_level senza modifiche',
      key_points: ['string — punti chiave narrativi, massimo 4'],
      risks: ['string — rischi concreti, massimo 3'],
      recommendation: 'string — raccomandazione operativa',
      next_session: { label: 'S{week}.{n}', content: 'string' },
      change_proposal: 'object | null — solo se update_plan o post_run_review',
      pre_run_brief: {
        warmup: 'string',
        target: 'string',
        rules: ['string', 'string', 'string'],
      },
      plan_changes: [{ title: 'string', detail: 'string' }],
      source: {
        sessions_considered: 0,
        latest_session_label: 'string | null',
        next_session_label: 'string | null',
        current_week: 0,
      },
    },
  };
}

function resolveProvider(preference: ProviderPreference): Provider {
  if (preference === 'local') return 'local';

  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  console.log(`[coach] Risoluzione provider: OpenAI=${hasOpenAI}, Anthropic=${hasAnthropic}, preferenza=${preference}`);

  if (preference === 'openai') {
    if (hasOpenAI) return 'openai';
    if (hasAnthropic) return 'anthropic';
    return 'local';
  }

  if (preference === 'anthropic') {
    if (hasAnthropic) return 'anthropic';
    if (hasOpenAI) return 'openai';
    return 'local';
  }

  if (hasOpenAI) return 'openai';
  if (hasAnthropic) return 'anthropic';
  return 'local';
}

async function callOpenAI(
  context: ReturnType<typeof buildCoachContext>,
  preCalculated: CoachResponse,
  modelOverride?: string,
): Promise<CoachResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[coach] ❌ OPENAI_API_KEY non trovata — uso fallback locale');
    return preCalculated;
  }

  const isOpenAIModel = modelOverride && /^gpt-/.test(modelOverride);
  const model = (isOpenAIModel ? modelOverride : null) || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  console.log(`[coach] OpenAI - Modello: ${model}`);

  try {
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
            content: JSON.stringify(buildCoachPayload(context, preCalculated)),
          },
        ],
      }),
    });

    console.log(`[coach] OpenAI Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[coach] ❌ OpenAI Error: ${response.status} - ${errorText}`);
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    const content = extractOpenAIText(json);
    console.log(`[coach] OpenAI content estratto: ${content.length} char`);

    const parsed = parseJsonResponse(content);
    if (!parsed) {
      console.warn('[coach] ⚠️ OpenAI: parsing JSON fallito');
      return preCalculated;
    }

    console.log('[coach] ✅ OpenAI response completata');
    return normalizeResponse(parsed, 'openai', preCalculated);
  } catch (err) {
    console.error('[coach] ❌ OpenAI Exception:', err instanceof Error ? err.message : err);
    throw err;
  }
}

async function callAnthropic(
  context: ReturnType<typeof buildCoachContext>,
  preCalculated: CoachResponse,
  modelOverride?: string,
): Promise<CoachResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[coach] ❌ ANTHROPIC_API_KEY non trovata — uso fallback locale');
    return preCalculated;
  }

  const isClaudeModel = modelOverride && /^claude-/.test(modelOverride);
  const model = (isClaudeModel ? modelOverride : null) || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
  console.log(`[coach] ✅ Anthropic - Modello: ${model}`);

  try {
    const payload = buildCoachPayload(context, preCalculated);
    console.log('[coach] System prompt length:', buildCoachSystemPrompt().length);
    console.log('[coach] Request type:', context.request_type);
    console.log('[coach] Pre-calculated risk_level:', preCalculated.risk_level);
    console.log('[coach] User message:', context.user_message ?? '(nessuno)');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 3000,
        temperature: 0.2,
        system: buildCoachSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: JSON.stringify(payload),
          },
        ],
      }),
    });

    console.log(`[coach] Anthropic Status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[coach] ❌ Anthropic Error: ${response.status} - ${errorText}`);
      throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
    }

    const json = await response.json();
    console.log('[coach] ✅ Risposta Anthropic ricevuta');
    console.log('[coach] Raw JSON:', JSON.stringify(json).substring(0, 300));

    const content = extractAnthropicText(json);
    console.log(`[coach] Anthropic content estratto: ${content.length} char`);
    if (content.length > 0) {
      console.log('[coach] Content preview:', content.substring(0, 300));
    }

    const parsed = parseJsonResponse(content);
    if (!parsed) {
      console.warn('[coach] ⚠️ Anthropic: parsing JSON fallito');
      console.warn(`[coach] Raw content: ${content.substring(0, 500)}`);
      return preCalculated;
    }

    // Usa normalizeResponse per unire eventuali fallback per pre_run_brief, e forzare provider/risk_level
    const enforced = normalizeResponse(parsed, 'anthropic', preCalculated);

    console.log('[coach] ✅ Anthropic response completata, risk_level:', enforced.risk_level);
    return enforced;
  } catch (err) {
    console.error('[coach] ❌ Anthropic Exception:', err instanceof Error ? err.message : err);
    throw err;
  }
}

async function runCoach(
  context: ReturnType<typeof buildCoachContext>,
  providerPreference: ProviderPreference,
  modelOverride?: string,
): Promise<CoachResponse> {
  const provider = resolveProvider(providerPreference);
  console.log(`[coach] Provider selezionato: ${provider}`);

  // Calcola sempre i dati lato server — li usiamo come ground truth e come fallback
  const preCalculated = buildCoachResponse(context, provider === 'local' ? 'local' : provider as CoachResponse['provider']);
  console.log(`[coach] Pre-calculated risk_level: ${preCalculated.risk_level}`);

  try {
    if (provider === 'openai') return await callOpenAI(context, preCalculated, modelOverride);
    if (provider === 'anthropic') return await callAnthropic(context, preCalculated, modelOverride);
    console.log('[coach] Usando provider locale');
    return preCalculated;
  } catch (err) {
    console.error('[coach] ❌ Catch generale - Fallback a precalcolato:', err instanceof Error ? err.message : err);
    return preCalculated;
  }
}

export async function POST(request: Request) {
  console.log('[coach] POST request ricevuta');

  if (!supabaseUrl || !supabaseKey) {
    console.error('[coach] ❌ Variabili Supabase mancanti');
    return NextResponse.json(
      { error: 'Missing Supabase environment variables.' },
      { status: 500 },
    );
  }

  const body = parseRequest(await request.json().catch(() => null));
  console.log(`[coach] Request type: ${body.request_type}, provider: ${body.provider}`);

  const supabase = createClient(supabaseUrl, supabaseKey);

  const [sessionsResult, usciteResult, settimaneResult] = await Promise.all([
    supabase.from('preparazione_corsa_9km').select('*').order('data', { ascending: true }),
    supabase.from('uscite_piano').select('*').order('settimana', { ascending: true }).order('numero_uscita', { ascending: true }),
    supabase.from('piano_settimane').select('*').order('settimana', { ascending: true }),
  ]);

  if (sessionsResult.error || usciteResult.error || settimaneResult.error) {
    console.error('[coach] ❌ Errore Supabase:', {
      sessions: sessionsResult.error?.message,
      uscite: usciteResult.error?.message,
      settimane: settimaneResult.error?.message,
    });
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

  console.log(`[coach] Dati caricati: ${(sessionsResult.data ?? []).length} sessioni, ${(usciteResult.data ?? []).length} uscite`);

  const context = buildCoachContext({
    request_type: body.request_type,
    user_message: body.user_message,
    sessions: (sessionsResult.data ?? []) as SessionRow[],
    uscite: (usciteResult.data ?? []) as UscitaRow[],
    settimane: (settimaneResult.data ?? []) as SettimanaRow[],
  });

  const result = await runCoach(context, body.provider ?? 'auto', body.model);
  console.log(`[coach] Response provider: ${result.provider}`);
  
  return NextResponse.json(result);
}