import { ANALYSIS_PROMPT } from '../../../lib/prompts';

export const runtime = 'nodejs';
export const maxDuration = 30;

// ------------------------------------------------------------
// POST /api/analyze
// body: { image: dataUri }
// Usa Gemini (testo+vision) per capire quali step servono davvero.
// Se GOOGLE_API_KEY non è configurata risponde { available: false }
// e il client applicherà tutti gli step di default.
// ------------------------------------------------------------

const ANALYSIS_MODEL = process.env.GOOGLE_ANALYSIS_MODEL || 'gemini-2.5-flash';

export async function POST(req) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return Response.json({ available: false });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON non valido' }, { status: 400 });
  }

  const m = /^data:(.+?);base64,(.*)$/.exec(body.image || '');
  if (!m) {
    return Response.json({ error: 'Immagine non valida' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${ANALYSIS_MODEL}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: ANALYSIS_PROMPT },
                { inline_data: { mime_type: m[1], data: m[2] } },
              ],
            },
          ],
        }),
      }
    );

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google ${res.status}`);

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || '')
        .join('') || '';

    // Estrai il JSON anche se il modello aggiunge testo attorno
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    return Response.json({
      available: true,
      analysis: {
        storta: Boolean(parsed.storta),
        buttercream: Boolean(parsed.buttercream),
        imperfezioni: Boolean(parsed.imperfezioni),
        fondale_interrotto: Boolean(parsed.fondale_interrotto),
      },
    });
  } catch (err) {
    // Se l'analisi fallisce non blocchiamo la pipeline:
    // il client applica tutti gli step.
    return Response.json({ available: false, error: err.message });
  }
}
