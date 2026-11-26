// /api/places — destinos frecuentes de cada pasajero (por su teléfono).
// GET  ?tel=999... → mis destinos guardados
// POST {tel, nombre, destino} → guardar / actualizar (un destino, un nombre)
// DELETE ?tel=...&destino=... → borrar uno
const { getSql, ensureSchema, readBody, send, methodNotAllowed } = require('../lib/db');
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
module.exports = async (req, res) => {
  try {
    const sql = getSql(); await ensureSchema(sql);
    if (req.method === 'GET') {
      const tel = String((req.query || {}).tel || '').trim();
      if (!tel) return send(res, 200, { ok: true, places: [] });
      const rows = await sql`SELECT * FROM places WHERE tel = ${tel} ORDER BY created_at DESC`;
      return send(res, 200, { ok: true, places: rows });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const tel = String(b.tel || '').trim(), nombre = String(b.nombre || '').trim(), destino = String(b.destino || '').trim();
      if (!tel || !nombre || !destino) return send(res, 400, { ok: false, error: 'Falta teléfono, nombre o destino.' });
      await sql`INSERT INTO places (id, tel, nombre, destino) VALUES (${uid()}, ${tel}, ${nombre}, ${destino})
        ON CONFLICT (tel, destino) DO UPDATE SET nombre = EXCLUDED.nombre`;
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      const q = req.query || {};
      await sql`DELETE FROM places WHERE tel = ${String(q.tel || '')} AND destino = ${String(q.destino || '')}`;
      return send(res, 200, { ok: true });
    }
    return methodNotAllowed(res, 'GET, POST, DELETE');
  } catch (e) { return send(res, e.status || 500, { ok: false, error: String(e.message || e) }); }
};
