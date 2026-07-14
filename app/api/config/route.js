export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const fal = Boolean(process.env.FAL_KEY);
  const google = Boolean(process.env.GOOGLE_API_KEY);
  const defaultProvider =
    process.env.DEFAULT_PROVIDER || (fal ? 'fal' : google ? 'google' : null);

  return Response.json({
    providers: { fal, google },
    defaultProvider,
    // l'analisi automatica usa Gemini (testo+vision): disponibile solo con chiave Google
    analysis: google,
  });
}
