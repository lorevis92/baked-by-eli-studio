export const runtime = 'nodejs';
export const maxDuration = 60;

// ------------------------------------------------------------
// POST /api/edit/status
// body: { statusUrl, responseUrl }
// Fa da proxy autenticato verso la queue di fal.ai.
// Quando il job è COMPLETED scarica l'immagine e la restituisce
// come data URI (così il client può incatenarla allo step dopo).
// ------------------------------------------------------------

function assertFalUrl(url) {
  const u = new URL(url);
  if (u.hostname !== 'queue.fal.run') {
    throw new Error('URL non consentito');
  }
  return u.toString();
}

export async function POST(req) {
  const key = process.env.FAL_KEY;
  if (!key) {
    return Response.json({ error: 'FAL_KEY non configurata' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Body JSON non valido' }, { status: 400 });
  }

  try {
    const statusUrl = assertFalUrl(body.statusUrl);
    const responseUrl = assertFalUrl(body.responseUrl);
    const headers = { Authorization: `Key ${key}` };

    const statusRes = await fetch(statusUrl, { headers });
    const status = await statusRes.json().catch(() => ({}));

    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(responseUrl, { headers });
      const result = await resultRes.json().catch(() => ({}));
      const imageUrl = result?.images?.[0]?.url;
      if (!imageUrl) {
        return Response.json(
          { status: 'FAILED', error: 'Nessuna immagine nel risultato FAL' },
          { status: 500 }
        );
      }
      // Scarica l'immagine e restituiscila come data URI
      const imgRes = await fetch(imageUrl);
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const mime = imgRes.headers.get('content-type') || 'image/jpeg';
      return Response.json({
        status: 'COMPLETED',
        image: `data:${mime};base64,${buf.toString('base64')}`,
      });
    }

    if (status.status === 'FAILED' || statusRes.status >= 400) {
      return Response.json(
        {
          status: 'FAILED',
          error: `Job FAL fallito: ${JSON.stringify(status).slice(0, 300)}`,
        },
        { status: 500 }
      );
    }

    // IN_QUEUE / IN_PROGRESS
    return Response.json({ status: status.status || 'IN_PROGRESS' });
  } catch (err) {
    return Response.json(
      { error: err.message || 'Errore nel polling' },
      { status: 500 }
    );
  }
}
