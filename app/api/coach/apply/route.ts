import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { PlanChangeProposal } from '@/lib/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isProposal(value: unknown): value is PlanChangeProposal {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as PlanChangeProposal;
  return (
    candidate.operation === 'replace_content' &&
    typeof candidate.target_id === 'string' &&
    typeof candidate.target_label === 'string' &&
    typeof candidate.before === 'string' &&
    typeof candidate.after === 'string' &&
    typeof candidate.reason === 'string' &&
    typeof candidate.confidence === 'number' &&
    typeof candidate.requires_confirmation === 'boolean'
  );
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
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
  const proposal = (body && typeof body === 'object' ? (body as { proposal?: unknown }).proposal : null);

  if (!isProposal(proposal)) {
    return NextResponse.json(
      { error: 'Invalid change proposal.' },
      { status: 400 },
    );
  }

  if (!proposal.requires_confirmation) {
    return NextResponse.json(
      { error: 'Proposal must require confirmation before apply.' },
      { status: 400 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const currentResult = await supabase
    .from('uscite_piano')
    .select('id_key, settimana, numero_uscita, contenuto')
    .eq('id_key', proposal.target_id)
    .single();

  if (currentResult.error) {
    return NextResponse.json(
      {
        error: 'Could not load target session.',
        details: currentResult.error.message,
      },
      { status: 404 },
    );
  }

  const current = currentResult.data;
  if (normalizeText(current.contenuto) !== normalizeText(proposal.before)) {
    return NextResponse.json(
      {
        error: 'Target content changed since proposal was created.',
        current: {
          target_id: current.id_key,
          target_label: `S${current.settimana}.${current.numero_uscita}`,
          content: current.contenuto,
        },
      },
      { status: 409 },
    );
  }

  const updateResult = await supabase
    .from('uscite_piano')
    .update({ contenuto: proposal.after })
    .eq('id_key', proposal.target_id)
    .select('id_key, settimana, numero_uscita, contenuto')
    .single();

  if (updateResult.error) {
    return NextResponse.json(
      {
        error: 'Update failed.',
        details: updateResult.error.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    updated: {
      target_id: updateResult.data.id_key,
      target_label: `S${updateResult.data.settimana}.${updateResult.data.numero_uscita}`,
      content: updateResult.data.contenuto,
    },
  });
}

