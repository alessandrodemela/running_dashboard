# 🏃 Running Dashboard — 9km × 150D+

Dashboard dei progressi di allenamento per la corsa del 25 Giugno 2026.
Dati in real-time da Supabase, deploy su Vercel.

---

## Setup locale

```bash
# 1. Installa dipendenze
npm install

# 2. Configura variabili di ambiente
cp .env.local.example .env.local
# → Apri .env.local e inserisci la tua ANON KEY da:
#   Supabase Dashboard → Project Settings → API → Project API keys → anon public

# 3. Avvia in dev
npm run dev
# → http://localhost:3000
```

---

## Deploy su Vercel

### Metodo rapido (consigliato)

1. Fai push di questa cartella su un repo GitHub
2. Vai su [vercel.com](https://vercel.com) → **New Project** → importa il repo
3. Nella sezione **Environment Variables** aggiungi:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://iochykvqiyrcswefqayq.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la tua anon key
4. Click **Deploy** → pronto in ~60 secondi

### Dove trovo l'Anon Key?

Supabase Dashboard → seleziona il progetto → **Project Settings** (ingranaggio) → **API** → sezione *Project API keys* → copia `anon` `public`

---

## Struttura

```
app/
  layout.tsx   → HTML shell + Google Fonts
  globals.css  → CSS variables + animazioni
  page.tsx     → Dashboard completo (client component)
  api/coach    → Coach endpoint per analisi e briefing
components/
  CoachPanel.tsx → UI del coach dentro la dashboard
lib/
  coach.ts     → parsing, heuristics e tipi condivisi
```

---

## Dati visualizzati

| Sezione | Tabella Supabase |
|---|---|
| Sessioni log, grafici | `preparazione_corsa_9km` |
| Piano settimanale | `uscite_piano` + `piano_settimane` |

> **Nota**: le tabelle hanno RLS disabilitato → l'anon key può leggere senza policy aggiuntive.

---

## Cosa mostra il dashboard

- ⏱ Conto alla rovescia live alla gara
- 📊 KPI: sessioni completate, km totali, best pace, walk breaks
- 📈 Grafici: evoluzione passo, RPE/gambe, walk breaks, distanza
- 🗓 Piano settimanale con progress bar e dot per sessione
- 📋 Log sessioni con tabella completa
- 🎯 Prossima sessione in evidenza
- 🤖 AI coach con analisi, briefing pre-corsa e review post-run
- 🏁 Strategia di gara

---

## AI Coach

L’endpoint `POST /api/coach` legge Supabase, costruisce un contesto strutturato e:

- usa OpenAI se `OPENAI_API_KEY` è presente
- altrimenti torna a un’analisi locale deterministica

Variabili utili:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (opzionale, default `gpt-4.1-mini`)

Il pannello AI compare già nella dashboard e supporta:

- `Analizza ultime corse`
- `Briefing pre-corsa`
- `Aggiorna piano`
- `Post-corsa`
