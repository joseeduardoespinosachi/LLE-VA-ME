// /api/reviews — estrellas y opiniones (compartidas).
// GET  ?target=<id del chofer> → lista + promedio
// POST {target, kind, stars (1-5), anon, txt}
const { getSql, ensureSchema, readBody, send, methodNotAllowed } = require('../lib/db');
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
module.exports = async (req, res) => {
  try {
    const sql = getSql(); await ensureSchema(sql);
    if (req.method === 'GET') {
      const target = String((req.query || {}).target || '');
      if (!target) return send(res, 400, { ok: false, error: 'Falta target.' });
      const rows = await sql`SELECT * FROM reviews WHERE target = ${target} ORDER BY created_at DESC LIMIT 100`;
      const avg = rows.length ? rows.reduce((a, r) => a + r.stars, 0) / rows.length : null;
      return send(res, 200, { ok: true, reviews: rows, avg, count: rows.length });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const stars = parseInt(b.stars, 10);
      if (!b.target || !stars || stars < 1 || stars > 5) return send(res, 400, { ok: false, error: 'Las estrellas van del 1 al 5.' });
      await sql`INSERT INTO reviews (id, target, kind, stars, anon, txt) VALUES (${uid()}, ${String(b.target)}, ${String(b.kind || 'chofer')}, ${stars}, ${!!b.anon}, ${String(b.txt || '').slice(0, 500)})`;
      return send(res, 200, { ok: true });
    }
    return methodNotAllowed(res, 'GET, POST');
  } catch (e) { return send(res, e.status || 500, { ok: false, error: String(e.message || e) }); }
};
