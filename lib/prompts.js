// ============================================================
// PROMPT LIBRARY — Baked by Eli Studio
// Ogni step della pipeline ha: id, label, prompt.
// Il feedback dell'utente viene agganciato dal client tramite
// buildPrompt(step, feedback).
// ============================================================

export const FORMATS = {
  '1:1': 'quadrato 1:1 (post Instagram)',
  '4:5': 'verticale 4:5 (post Instagram)',
  '9:16': 'verticale 9:16 (storie/reel Instagram)',
};

export const STEPS = [
  {
    id: 'straighten',
    label: 'Allineamento',
    short: 'Raddrizza prospettiva e linee',
    analysisKey: 'storta',
    prompt: `Questa è una foto di una torta artigianale per Instagram. Migliora SOLO questi aspetti:
- correggi la prospettiva e raddrizza le linee (piano d'appoggio, bordi della torta, linee verticali e orizzontali)
- bilancia l'esposizione e il bianco (luce naturale, non troppo calda/fredda)
- aumenta leggermente nitidezza e contrasto

NON modificare: forma della torta, decorazioni, scritte, colori della glassa/crema, proporzioni. La torta deve rimanere identica al 100% nella sua identità visiva, cambia solo la qualità fotografica.`,
  },
  {
    id: 'buttercream',
    label: 'Buttercream liscia',
    short: 'Ripara la superficie in buttercream',
    analysisKey: 'buttercream',
    prompt: `Questa torta ha una base/copertura in buttercream che dovrebbe essere liscia e uniforme, ma presenta imperfezioni non intenzionali: righe irregolari, buchi, bolle d'aria, segni di spatola non voluti, zone opache o granulose, piccole crepe o disomogeneità di colore.

Correggi SOLO queste imperfezioni, ricostruendo una superficie liscia coerente con il resto della torta:
- stessa tonalità di colore già presente nelle zone lisce della stessa torta
- stessa finitura (satinata/opaca, mai plasticosa o eccessivamente lucida)
- mantieni una leggerissima texture naturale da spatola (il buttercream reale non è mai perfettamente piatto come plastica: piccolissime variazioni di superficie sono normali e vanno preservate)
- i bordi/spigoli della torta restano netti e puliti come da tecnica professionale

NON toccare: decorazioni, scritte, bordi decorativi, topper, elementi applicati. NON cambiare tonalità di colore rispetto all'originale. NON rendere la superficie innaturalmente liscia o "digitale" — deve restare riconoscibile come buttercream vero fatto a mano.`,
  },
  {
    id: 'imperfections',
    label: 'Pulizia generale',
    short: 'Rimuovi briciole, sbavature, difetti',
    analysisKey: 'imperfezioni',
    prompt: `Ispeziona questa foto di una torta artigianale e correggi eventuali imperfezioni non intenzionali dovute a trasporto, manipolazione o esecuzione, tra cui: briciole cadute sulla superficie o sul piatto, piccole sbavature di crema fuori posto, impronte o segni di dita, macchie, gocce, polvere, elementi decorativi leggermente storti o fuori allineamento rispetto al pattern generale.

Per ogni correzione: ricostruisci la zona interessata continuando texture, colore e pattern già presenti nella stessa area della torta. Se un elemento decorativo è leggermente storto rispetto a un pattern chiaramente ripetuto (es. una fila di perline, un bordo a conchiglia), puoi riallinearlo alla logica del pattern esistente — non inventare nuovi elementi, solo correggere la posizione di quelli già presenti.

NON alterare: forma generale della torta, scelte di design, colori, tipo di decorazione, testo/scritte (anche se la grafia è "imperfetta" a mano — fa parte dell'artigianalità e va preservata così com'è, a meno che non sia illeggibile per un difetto tecnico, es. colore sbavato).

L'obiettivo è una torta pulita e curata, non una torta diversa o "corretta" nel design.`,
  },
  {
    id: 'background',
    label: 'Sfondo infinito',
    short: 'Estendi il fondale colorato senza interruzioni',
    analysisKey: 'fondale_interrotto',
    // {FORMAT} viene sostituito dal client
    prompt: `Questa è una foto prodotto di una torta scattata su un fondale di tessuto/carta colorato (backdrop), che nell'immagine originale è troppo piccolo e si interrompe prima del bordo dell'inquadratura, lasciando visibili elementi indesiderati dietro o intorno ad esso (bordo del telo, tavolo, pavimento, muro, pieghe che finiscono).

Estendi il fondale colorato in modo che copra l'intera area dell'immagine in formato {FORMAT}, come se fosse un fondale da studio fotografico a tinta unita continua ("infinity cove"), senza alcuna interruzione, bordo visibile o cambio di superficie:

- identifica il colore, la tonalità e la texture esatti del fondale esistente (incluse eventuali pieghe o leggere variazioni di tessuto) e continuali in modo naturale su tutta l'area mancante
- mantieni coerente il gradiente di luce già presente nello scatto originale: se il fondale è più chiaro/illuminato in un punto e più scuro ai bordi (vignettatura naturale da studio), continua lo stesso gradiente, non un colore piatto uniforme
- rimuovi completamente qualunque elemento estraneo che interrompe il fondale (bordo del telo, superficie del tavolo, pavimento, muro, oggetti di scena) sostituendolo con la continuazione del colore e della texture del fondale
- ricostruisci l'ombra proiettata dalla torta sul fondale in modo fisicamente plausibile, coerente con direzione e morbidezza della luce originale

NON modificare la torta: stessa forma, stessi colori, stesse decorazioni, stessa posizione e scala nell'inquadratura. Il fondale deve apparire come un unico foglio di colore continuo e professionale, senza cuciture, bordi o discontinuità visibili.`,
  },
  {
    id: 'background_rescale',
    label: 'Sfondo infinito + più respiro',
    short: 'Rimpicciolisce la torta ed estende il fondale',
    analysisKey: null, // mai automatico: solo su scelta esplicita (è lo step più rischioso)
    prompt: `Questa è una foto prodotto di una torta. Nello scatto originale la torta occupa gran parte del frame e il fondale colorato (telo/carta) è troppo piccolo, interrompendosi prima del bordo dell'inquadratura e lasciando visibili elementi indesiderati dietro di esso (bordo del telo, tavolo, pavimento, muro).

Obiettivo: ricomponi l'immagine in formato {FORMAT} con questi due interventi combinati:

1) RISCALA LA TORTA
Riduci proporzionalmente la scala della torta rispetto al frame (stessa forma, stesse proporzioni interne, nessuna distorsione), centrata o leggermente decentrata secondo la regola dei terzi, per lasciare più spazio visibile intorno ad essa. Non tagliare né ritagliare la torta ai bordi.

2) ESTENDI IL FONDALE COME UNO SFONDO INFINITO DA STUDIO
In tutta l'area di sfondo (sia quella già esistente attorno alla torta sia quella resa visibile dal ridimensionamento), il fondale colorato deve coprire l'intera immagine in modo continuo, come un "infinity cove" da studio fotografico, senza interruzioni, bordi visibili o cambi di superficie:
- identifica colore, tonalità e texture esatti del fondale esistente (incluse eventuali pieghe) e continuali in modo naturale su tutta l'area
- mantieni coerente l'eventuale gradiente di luce già presente (zone più chiare/più scure, vignettatura naturale da studio), non un colore piatto uniforme
- rimuovi completamente qualunque elemento estraneo che interrompe il fondale (bordo del telo, tavolo, pavimento, muro, oggetti di scena), sostituendolo con la continuazione del colore e della texture del fondale
- ricostruisci l'ombra proiettata dalla torta sul fondale, proporzionata alla nuova scala, coerente con direzione e morbidezza della luce originale

NON modificare la torta: stessa forma, stessi colori, stesse decorazioni, stessa angolazione. Solo la sua scala rispetto al frame deve cambiare. Il risultato finale deve sembrare una foto scattata in uno studio professionale con un fondale colorato grande a sufficienza, senza alcun taglio o discontinuità visibile.`,
  },
];

// Step "di set": uniforma colore/luce di una foto rispetto a una foto di riferimento.
// Richiede DUE immagini in input: [riferimento, foto da uniformare].
export const UNIFORM_STEP = {
  id: 'uniform',
  label: 'Uniforma il set',
  short: 'Stessa luce e stessi colori su tutte le foto',
  prompt: `Ti fornisco due foto dello stesso servizio fotografico di torte. La PRIMA immagine è il riferimento di colore, temperatura, esposizione e stile luce. Applica alla SECONDA immagine la stessa temperatura colore (bilanciamento del bianco), stessa luminosità/contrasto generale, stesso tono del fondale, stessa intensità e morbidezza apparente della luce, in modo che le due foto risultino scattate nello stesso momento, con la stessa luce e nello stesso setup.

NON modificare il contenuto della seconda foto (torta, decorazioni, angolazione, inquadratura) — solo la resa cromatica e luminosa deve uniformarsi al riferimento. Restituisci SOLO la seconda immagine corretta.`,
};

// Prompt usato quando l'utente dà un feedback su un risultato ("Non mi convince").
// {FEEDBACK} viene sostituito con il testo dell'utente.
export const FEEDBACK_STEP = {
  id: 'feedback_fix',
  label: 'Correzione mirata',
  prompt: `Questa è una foto prodotto di una torta artigianale già parzialmente editata. L'utente ha segnalato un problema specifico da correggere:

"{FEEDBACK}"

Applica SOLO questa correzione, mantenendo tutto il resto dell'immagine invariato.

Regole fisse da rispettare sempre:
- NON modificare forma, decorazioni, scritte e colori della torta (a meno che il feedback non lo richieda esplicitamente)
- il fondale deve restare continuo e senza interruzioni
- ombre e luce devono restare fisicamente plausibili e coerenti
- il risultato deve rimanere fotorealistico e fedele alla torta reale`,
};

// Prompt per l'analisi automatica (usato con un modello vision, output JSON).
export const ANALYSIS_PROMPT = `Analizza questa foto di una torta artigianale scattata per Instagram. Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo e senza backtick, con questi campi booleani:

{
  "storta": true se l'inquadratura è visibilmente storta o la prospettiva è distorta (più di ~2 gradi), altrimenti false,
  "buttercream": true se la torta ha una copertura in buttercream/crema che presenta imperfezioni evidenti (righe, buchi, bolle, zone irregolari dove dovrebbe essere liscia), altrimenti false,
  "imperfezioni": true se ci sono briciole, sbavature, macchie, gocce o piccoli difetti visibili sulla torta o sul piatto, altrimenti false,
  "fondale_interrotto": true se lo sfondo/fondale colorato si interrompe prima dei bordi della foto (si vede il bordo del telo, il tavolo, il pavimento, il muro o altri elementi dietro), altrimenti false
}`;

export function buildPrompt(step, { format = '1:1', feedback = [] } = {}) {
  let p = step.prompt.replaceAll('{FORMAT}', FORMATS[format] || FORMATS['1:1']);
  const fb = (feedback || []).filter(Boolean);
  if (fb.length > 0) {
    p +=
      `\n\nCORREZIONI RICHIESTE DALL'UTENTE nei tentativi precedenti (priorità alta, applicale se pertinenti a questo intervento):\n` +
      fb.map((f) => `- ${f}`).join('\n');
  }
  return p;
}

export function buildFeedbackPrompt(feedbackText) {
  return FEEDBACK_STEP.prompt.replaceAll('{FEEDBACK}', feedbackText.trim());
}
