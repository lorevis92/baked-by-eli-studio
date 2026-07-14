# Baked by Eli — Studio Foto 🎂

App per trasformare le foto delle torte in immagini pronte per Instagram, con un solo tocco.

**Flusso semplice:** carichi le foto → premi "Sistema tutto" → scarichi le immagini finite.
**Flusso avanzato:** per le foto che non vengono perfette, puoi andare passo per passo (allineamento, buttercream, pulizia, sfondo infinito, sfondo + rimpicciolimento) e dare feedback in italiano ("l'ombra è troppo dura") che viene incorporato nelle rigenerazioni successive.

## Come funziona la pipeline

1. **Analisi automatica** (se GOOGLE_API_KEY è configurata): ogni foto viene analizzata per capire quali correzioni servono davvero — così non si editano cose già a posto e si risparmiano chiamate.
2. **Step di correzione** in sequenza, solo quelli necessari:
   - Allineamento (prospettiva, linee dritte, esposizione)
   - Buttercream liscia (ripara la superficie dove dovrebbe essere liscia)
   - Pulizia generale (briciole, sbavature, macchie)
   - Sfondo infinito (estende il fondale colorato senza interruzioni)
3. **Uniformità del set**: se carichi più foto insieme, alla fine vengono uniformate per colore e luce usando la prima come riferimento (disattivabile).
4. **Feedback loop**: "Non mi convince" → scrivi cosa non va → la correzione viene applicata subito E ricordata per le rigenerazioni successive di quella foto.

## Setup in 5 minuti

### 1. Chiave FAL.ai

1. Vai su [fal.ai](https://fal.ai) e crea un account
2. Dashboard → **Keys** → **Create key** ([link diretto](https://fal.ai/dashboard/keys))
3. Copia la chiave (formato `xxxx:yyyy`)

### 2. Sviluppo locale (opzionale)

```bash
npm install
cp .env.example .env.local
# apri .env.local e incolla la chiave in FAL_KEY=
npm run dev
```

Apri http://localhost:3000

### 3. Deploy su Vercel

**Via dashboard (più semplice):**

1. Carica il progetto su GitHub (vedi sotto)
2. Vai su [vercel.com/new](https://vercel.com/new) → **Import** il repository
3. Prima di premere Deploy, apri **Environment Variables** e aggiungi:
   - Name: `FAL_KEY` — Value: la tua chiave FAL
4. **Deploy** — fine.

**Per aggiungere/cambiare variabili dopo il deploy:**
Vercel → il tuo progetto → **Settings** → **Environment Variables** → aggiungi → poi **Deployments** → ⋯ sul deployment più recente → **Redeploy** (le variabili si applicano solo ai nuovi deploy).

### 4. Attivare Google Gemini (predisposto)

Quando vuoi usare Google direttamente (per l'analisi automatica e/o come motore di editing alternativo):

1. Prendi una chiave su [Google AI Studio](https://aistudio.google.com/apikey)
2. Aggiungi `GOOGLE_API_KEY` alle variabili di ambiente (locale e/o Vercel)
3. Ricarica l'app: comparirà il selettore "Motore" (FAL / Google) e si attiverà l'analisi automatica

Nessuna modifica al codice necessaria. Per cambiare i modelli usati, vedi `.env.example` (`FAL_MODEL_ID`, `GOOGLE_MODEL_ID`).

## Creare il repository Git e collegarlo

```bash
cd baked-by-eli

# 1. Inizializza il repository
git init
git add .
git commit -m "Baked by Eli Studio Foto — prima versione"

# 2. Crea il repo su GitHub (via sito: github.com/new, nome: baked-by-eli-studio,
#    NON aggiungere README/gitignore da GitHub — li hai già)

# 3. Collega e carica
git remote add origin https://github.com/TUO_USERNAME/baked-by-eli-studio.git
git branch -M main
git push -u origin main
```

Da qui in poi, ogni `git push` su `main` fa ripartire automaticamente il deploy su Vercel.

## Struttura del progetto

```
app/
  page.js                  ← tutta la UI (modalità semplice + avanzata)
  layout.js, globals.css   ← brand Baked by Eli (rosa/nero)
  api/
    config/route.js        ← dice al client quali provider sono configurati
    edit/route.js          ← invia gli edit a FAL (queue) o Google (sync)
    edit/status/route.js   ← polling dei job FAL, restituisce l'immagine
    analyze/route.js       ← analisi pre-editing con Gemini (opzionale)
lib/
  prompts.js               ← TUTTI i prompt della pipeline (modificali qui)
```

## Costi indicativi

Con FAL/Nano Banana l'editing costa pochi centesimi a immagine. Una foto tipica passa per 2-4 step → ~10-20 centesimi a foto finita. L'analisi automatica con Gemini Flash costa frazioni di centesimo.

## Note

- Le foto vengono ridimensionate lato client a max 2048px prima dell'invio (limiti di payload + costi).
- Le chiavi API restano **solo lato server** (route API di Next.js): il browser non le vede mai.
- Nessun database: le foto vivono nella sessione del browser. Chiudi la pagina = ricominci da capo (per l'MVP è voluto).
