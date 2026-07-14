export const runtime = 'nodejs';
export const maxDuration = 60;

// ------------------------------------------------------------
// POST /api/edit
// body: { provider: 'fal' | 'google', prompt: string, images: [dataUri, ...] }
//
// - FAL:    invia il job alla queue di fal.ai e restituisce gli URL
//           di status/result (il client fa polling su /api/edit/status).
// - Google: chiama Gemini in modo sincrono e restituisce subito
//           l'immagine come data URI.
// ------------------------------------------------------------

const FAL_MODEL_ID = process.env.FAL_MODEL_ID || 'fal-ai/nano-banana/edit';
const GOOGLE_MODEL_ID = process.env.GOOGLE_MODEL_ID || 'gemini-2.5-flash-image';

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON non valido' }, { status: 400 });
  }

  const { provider, prompt, images } = body || {};
  if (!prompt || !Array.isArray(images) || images.length === 0) {
    return Response.json(
      { error: 'Servono "prompt" e almeno una immagine in "images"' },
      { status: 400 }
    );
  }

  try {
    if (provider === 'google') return await editWithGoogle(prompt, images);
    return await submitToFal(prompt, images);
  } catch (err) {
    console.error('edit error:', err);
    return Response.json(
      { error: err.message || 'Errore durante la modifica' },
      { status: 500 }
    );
  }
}

// ----------------------------- FAL -----------------------------

async function submitToFal(prompt, images) {
  const key = process.env.FAL_KEY;
  if (!key) {
    return Response.json(
      { error: 'FAL_KEY non configurata (aggiungila alle variabili di ambiente)' },
      { status: 500 }
    );
  }

  const res = await fetch(`https://queue.fal.run/${FAL_MODEL_ID}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_urls: images, // FAL accetta sia URL pubblici sia data URI base64
      num_images: 1,
      output_format: 'jpeg',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `FAL ha risposto ${res.status}: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  return Response.json({
    mode: 'queue',
    requestId: data.request_id,
    statusUrl: data.status_url,
    responseUrl: data.response_url,
  });
}

// ---------------------------- GOOGLE ----------------------------

function dataUriToInline(dataUri) {
  const m = /^data:(.+?);base64,(.*)$/.exec(dataUri);
  if (!m) throw new Error('Immagine non in formato data URI base64');
  return { inline_data: { mime_type: m[1], data: m[2] } };
}

async function editWithGoogle(prompt, images) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) {
    return Response.json(
      { error: 'GOOGLE_API_KEY non configurata' },
      { status: 500 }
    );
  }

  const parts = [{ text: prompt }, ...images.map(dataUriToInline)];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL_ID}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Google ha risposto ${res.status}: ${JSON.stringify(data).slice(0, 300)}`
    );
  }

  const outParts = data?.candidates?.[0]?.content?.parts || [];
  for (const p of outParts) {
    const inline = p.inlineData || p.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || 'image/png';
      return Response.json({
        mode: 'done',
        image: `data:${mime};base64,${inline.data}`,
      });
    }
  }
  throw new Error('Google non ha restituito nessuna immagine');
}
