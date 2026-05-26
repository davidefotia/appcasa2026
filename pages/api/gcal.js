export default async function handler(req, res) {
  const ICAL_URL = process.env.GCAL_ICAL_URL;
  if (!ICAL_URL) return res.status(500).json({ error: 'GCAL_ICAL_URL non configurata' });

  try {
    const response = await fetch(ICAL_URL, {
      headers: { 'User-Agent': 'CasaMia/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Cache-Control', 's-maxage=300'); // cache 5 minuti
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).json({ error: e.message });
  }
}
