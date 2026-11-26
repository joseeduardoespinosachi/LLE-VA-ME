// GET /api/setup — crea las tablas una sola vez. Ábrelo una vez en el navegador
// después de poner DATABASE_URL en Vercel. No borra nada si ya existen.
const { getSql, ensureSchema, send } = require('../lib/db');
module.exports = async (req, res) => {
  try {
    const sql = getSql();
    await ensureSchema(sql);
    const counts = {};
    for (const t of ['drivers', 'trips', 'reviews', 'reports', 'places', 'admin_settings']) {
      const r = await sql(`SELECT COUNT(*)::int AS n FROM ${t}`);
      counts[t] = r[0].n;
    }
    return send(res, 200, { ok: true, message: 'Tablas listas: drivers, trips, reviews, reports, places, admin_settings.', counts });
  } catch (e) {
    return send(res, e.status || 500, { ok: false, error: String(e.message || e) });
  }
};
