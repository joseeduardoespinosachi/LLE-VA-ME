// /api/admin — contraseña del dueño (JOSE), guardada con scrypt en el servidor.
// GET  → {exists: true/false} (¿ya se creó la contraseña?)
// POST {action:"create", password}   → crea la contraseña una sola vez. Devuelve token.
// POST {action:"login", password}    → entra. Devuelve token (válido 30 días).
// POST {action:"change", password}   → cambia la contraseña (con token de admin).
// POST {action:"logout"}             → borra el token.
// El token se guarda en el celular del admin (localStorage, solo en ese celular).
// Si se olvida la contraseña NO se puede recuperar: hay que borrar la fila
// admin_settings en Neon y crearla de nuevo (ver README).
const crypto = require('crypto');
const { getSql, ensureSchema, readBody, send, methodNotAllowed, checkAdmin } = require('../lib/db');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function newToken() { return crypto.randomBytes(32).toString('hex'); }

module.exports = async (req, res) => {
  try {
    const sql = getSql();
    await ensureSchema(sql);
    if (req.method === 'GET') {
      const rows = await sql`SELECT password_hash FROM admin_settings WHERE id = 1`;
      return send(res, 200, { ok: true, exists: !!(rows.length && rows[0].password_hash) });
    }
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET, POST');
    const b = await readBody(req);
    const action = String(b.action || '');
    const password = String(b.password || '');

    if (action === 'create') {
      const rows = await sql`SELECT password_hash FROM admin_settings WHERE id = 1`;
      if (rows.length && rows[0].password_hash) return send(res, 400, { ok: false, error: 'La contraseña de admin ya existe. Entra con ella o cámbiala.' });
      if (password.length < 4) return send(res, 400, { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' });
      const salt = crypto.randomBytes(16).toString('hex');
      const token = newToken();
      const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      await sql`INSERT INTO admin_settings (id, password_hash, salt, session_token, session_expires)
        VALUES (1, ${hashPassword(password, salt)}, ${salt}, ${token}, ${expires.toISOString()})
        ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash, salt = EXCLUDED.salt, session_token = EXCLUDED.session_token, session_expires = EXCLUDED.session_expires`;
      return send(res, 200, { ok: true, token, message: 'Contraseña creada. Escríbela en papel: si se olvida, no se puede recuperar.' });
    }

    if (action === 'login') {
      const rows = await sql`SELECT password_hash, salt FROM admin_settings WHERE id = 1`;
      if (!rows.length || !rows[0].password_hash) return send(res, 400, { ok: false, error: 'Todavía no hay contraseña de admin. Créala primero.' });
      const ok = crypto.timingSafeEqual(
        Buffer.from(hashPassword(password, rows[0].salt), 'hex'),
        Buffer.from(rows[0].password_hash, 'hex')
      );
      if (!ok) return send(res, 401, { ok: false, error: 'Contraseña incorrecta.' });
      const token = newToken();
      const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      await sql`UPDATE admin_settings SET session_token = ${token}, session_expires = ${expires.toISOString()} WHERE id = 1`;
      return send(res, 200, { ok: true, token });
    }

    if (action === 'change') {
      if (!(await checkAdmin(sql, req))) return send(res, 401, { ok: false, error: 'Entra como admin primero.' });
      if (password.length < 4) return send(res, 400, { ok: false, error: 'La contraseña debe tener al menos 4 caracteres.' });
      const salt = crypto.randomBytes(16).toString('hex');
      await sql`UPDATE admin_settings SET password_hash = ${hashPassword(password, salt)}, salt = ${salt} WHERE id = 1`;
      return send(res, 200, { ok: true, message: 'Contraseña cambiada. Escríbela en papel.' });
    }

    if (action === 'logout') {
      await sql`UPDATE admin_settings SET session_token = '', session_expires = NULL WHERE id = 1`;
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { ok: false, error: 'Acción no válida.' });
  } catch (e) {
    return send(res, e.status || 500, { ok: false, error: String(e.message || e) });
  }
};
