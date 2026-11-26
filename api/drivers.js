// /api/drivers — choferes (compartidos en Neon, no en localStorage).
// GET  ?approved=1      → choferes aprobados y disponibles (lista pública, teléfono tapado)
// GET  ?night=1         → aprobados con taxi nocturno (12 a 6 am)
// GET  ?tel=999...      → panel de un chofer por su teléfono (ve su estado y su nota)
// GET  ?all=1           → todos (solo admin, header x-admin-token)
// POST {nombre,tel,foto,foto_taxi,color,modelo,pais,estado,colonia,pueblo,rango,horario,urgencia,ine}
//      → registro nuevo, queda "pendiente". La foto del INE NO se guarda, solo si la subió.
// PATCH {id, action:"disponible"|"verificado"|"badge"|"status", value|status|note}
//      → "disponible" la hace el propio chofer; las demás solo el admin.
const { getSql, ensureSchema, readBody, send, methodNotAllowed, checkAdmin, publicDriver } = require('../lib/db');

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const MAX_FOTO = 700000; // ~700 KB de texto dataURL por foto. Más que eso, el celular debe bajar la foto.

module.exports = async (req, res) => {
  try {
    const sql = getSql();
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const q = req.query || {};
      if (q.tel) {
        const rows = await sql`SELECT * FROM drivers WHERE tel = ${String(q.tel).trim()} ORDER BY created_at DESC LIMIT 1`;
        if (!rows.length) return send(res, 200, { ok: true, driver: null });
        return send(res, 200, { ok: true, driver: publicDriver(rows[0], true) });
      }
      if (q.all === '1') {
        if (!(await checkAdmin(sql, req))) return send(res, 401, { ok: false, error: 'Solo el admin ve todos los choferes.' });
        const rows = await sql`SELECT * FROM drivers ORDER BY created_at DESC`;
        return send(res, 200, { ok: true, drivers: rows.map(d => publicDriver(d, true)) });
      }
      let rows;
      if (q.night === '1') {
        rows = await sql`SELECT * FROM drivers WHERE status = 'aprobado' AND urgencia = TRUE AND disponible = TRUE ORDER BY nombre ASC`;
      } else {
        rows = await sql`SELECT * FROM drivers WHERE status = 'aprobado' AND disponible = TRUE ORDER BY nombre ASC`;
      }
      return send(res, 200, { ok: true, drivers: rows.map(d => publicDriver(d, false)) });
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      const nombre = String(b.nombre || '').trim();
      const tel = String(b.tel || '').trim();
      if (!nombre || !tel) return send(res, 400, { ok: false, error: 'Falta el nombre o el teléfono del chofer.' });
      if (!String(b.color || '').trim() || !String(b.modelo || '').trim() || !String(b.pueblo || '').trim()) {
        return send(res, 400, { ok: false, error: 'Falta el color, el modelo o el pueblo del mototaxi.' });
      }
      const foto = String(b.foto || '').slice(0, MAX_FOTO);
      const fotoTaxi = String(b.foto_taxi || '').slice(0, MAX_FOTO);
      if ((b.foto && b.foto.length > MAX_FOTO) || (b.foto_taxi && b.foto_taxi.length > MAX_FOTO)) {
        return send(res, 400, { ok: false, error: 'La foto es muy grande. Toma la foto con menos luz o recórtala y vuelve a intentarlo.' });
      }
      const id = uid();
      await sql`INSERT INTO drivers (id, nombre, tel, foto, foto_taxi, color, modelo, pais, estado, colonia, pueblo, rango, horario, urgencia, ine, status, verificado, badges, disponible)
        VALUES (${id}, ${nombre}, ${tel}, ${foto}, ${fotoTaxi}, ${String(b.color).trim()}, ${String(b.modelo).trim()},
        ${String(b.pais || 'México')}, ${String(b.estado || 'Yucatán')}, ${String(b.colonia || '')}, ${String(b.pueblo).trim()},
        ${String(b.rango || 'pueblo')}, ${String(b.horario || '')}, ${!!b.urgencia}, ${!!b.ine}, 'pendiente', FALSE, '[]', TRUE)`;
      return send(res, 200, { ok: true, id, message: 'Registro enviado. Queda pendiente hasta que el admin lo apruebe.' });
    }

    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const id = String(b.id || '');
      if (!id) return send(res, 400, { ok: false, error: 'Falta el id del chofer.' });
      if (b.action === 'disponible') {
        // El propio chofer prende/apaga su disponibilidad. Se verifica por teléfono.
        const rows = await sql`SELECT * FROM drivers WHERE id = ${id}`;
        if (!rows.length) return send(res, 404, { ok: false, error: 'Chofer no encontrado.' });
        if (String(b.tel || '').trim() && rows[0].tel !== String(b.tel).trim()) {
          return send(res, 403, { ok: false, error: 'Ese teléfono no es el del chofer.' });
        }
        await sql`UPDATE drivers SET disponible = ${!!b.value} WHERE id = ${id}`;
        return send(res, 200, { ok: true });
      }
      // Todo lo demás es solo admin.
      if (!(await checkAdmin(sql, req))) return send(res, 401, { ok: false, error: 'Solo el admin puede hacer eso.' });
      if (b.action === 'status') {
        const status = String(b.status || '');
        if (!['aprobado', 'rechazado', 'pendiente'].includes(status)) return send(res, 400, { ok: false, error: 'Estado no válido.' });
        await sql`UPDATE drivers SET status = ${status}, verificado = ${status === 'aprobado' ? true : false}, note = ${String(b.note || '')} WHERE id = ${id}`;
        return send(res, 200, { ok: true });
      }
      if (b.action === 'verificado') {
        await sql`UPDATE drivers SET verificado = ${!!b.value} WHERE id = ${id}`;
        return send(res, 200, { ok: true });
      }
      if (b.action === 'badge') {
        const rows = await sql`SELECT badges FROM drivers WHERE id = ${id}`;
        if (!rows.length) return send(res, 404, { ok: false, error: 'Chofer no encontrado.' });
        let badges = [];
        try { badges = JSON.parse(rows[0].badges || '[]'); } catch { badges = []; }
        const i = badges.indexOf('Buen comportamiento');
        if (i >= 0) badges.splice(i, 1); else badges.push('Buen comportamiento');
        await sql`UPDATE drivers SET badges = ${JSON.stringify(badges)} WHERE id = ${id}`;
        return send(res, 200, { ok: true, badges });
      }
      return send(res, 400, { ok: false, error: 'Acción no válida.' });
    }
    return methodNotAllowed(res, 'GET, POST, PATCH');
  } catch (e) {
    return send(res, e.status || 500, { ok: false, error: String(e.message || e) });
  }
};
