// GET /api/health — ¿está puesta DATABASE_URL y responde la base de datos?
const { getSql, ensureSchema, send } = require('../lib/db');
module.exports = async (req, res) => {
  try {
    const sql = getSql();
    const r = await sql`SELECT NOW() AS ahora`;
    return send(res, 200, { ok: true, db: true, ahora: r[0].ahora });
  } catch (e) {
    return send(res, 500, { ok: false, db: false, error: String(e.message || e) });
  }
};
