// /api/reports — reportes de comportamiento (compartidos, solo el admin los lee).
// GET  → solo admin (header x-admin-token)
// POST {target, why}
const { getSql, ensureSchema, readBody, send, methodNotAllowed, checkAdmin } = require('../lib/db');
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
module.exports = async (req, res) => {
  try {
    const sql = getSql(); await ensureSchema(sql);
    if (req.method === 'GET') {
      if (!(await checkAdmin(sql, req))) return send(res, 401, { ok: false, error: 'Solo el admin ve los reportes.' });
      const rows = await sql`SELECT * FROM reports ORDER BY created_at DESC LIMIT 200`;
      return send(res, 200, { ok: true, reports: rows });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (!b.target || !String(b.why || '').trim()) return send(res, 400, { ok: false, error: 'Falta el motivo del reporte.' });
      await sql`INSERT INTO reports (id, target, why) VALUES (${uid()}, ${String(b.target)}, ${String(b.why).slice(0, 500)})`;
      return send(res, 200, { ok: true, message: 'Reporte enviado al admin. Si es emergencia, llama al 911.' });
    }
    return methodNotAllowed(res, 'GET, POST');
  } catch (e) { return send(res, e.status || 500, { ok: false, error: String(e.message || e) }); }
};
