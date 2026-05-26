export default async function handler(req, res) {
  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'key required' });

  // Upstash via Vercel Integration usa questi nomi
  const BASE = process.env.KV_REST_API_URL;
  const TOKEN = process.env.KV_REST_API_TOKEN;

  if (!BASE || !TOKEN) {
    return res.status(500).json({ error: 'Database non configurato. Aggiungi KV_REST_API_URL e KV_REST_API_TOKEN.' });
  }

  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  if (req.method === 'GET') {
    try {
      const r = await fetch(`${BASE}/get/${encodeURIComponent(key)}`, { headers });
      const j = await r.json();
      // Il valore è già JSON stringificato, lo parsifiamo
      let value = j.result ?? null;
      if (typeof value === 'string') {
        try { value = JSON.parse(value); } catch {}
      }
      return res.status(200).json({ value });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { value } = req.body;
      const serialized = JSON.stringify(value);
      await fetch(`${BASE}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(serialized),
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
