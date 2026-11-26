// /api/trips — viajes (compartidos en Neon).
// GET  ?pending=1            → viajes pendientes para los choferes (teléfono tapado)
// GET  ?tel=999...           → mis viajes como pasajero (por mi teléfono)
// GET  ?driverId=...         → viajes de un chofer (aceptados / llegados)
// GET  ?all=1                → todos (solo admin)
// POST {nombre,tel,destino,ref,personas,carga,billete,cambio,mascota,otra{nombre,tel},cuando,fecha,gps{lat,lng},disc}
//      → crea un viaje pendiente con código de 4 dígitos.
// PATCH {id, action:"accept"|"arrived"|"completed"|"cancel", tel, precio, eta}
//      → accept: solo un chofer aprobado (se verifica su teléfono). arrived/completed: el chofer del viaje.
const { getSql, ensureSchema, readBody, send, methodNotAllowed, checkAdmin, publicTrip, publicDriver, maskPhone } = require('../lib/db');

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function code4() { return String(Math.floor(1000 + Math.random() * 9000)); }

async function loadDriversMap(sql, ids) {
  const map = {};
  for (const id of [...new Set(ids.filter(Boolean))]) {
    const r = await sql`SELECT * FROM drivers WHERE id = ${id} LIMIT 1`;
    if (r.length) map[id] = r[0];
  }
  return map;
}

module.exports = async (req, res) => {
  try {
    const sql = getSql();
    await ensureSchema(sql);

    if (req.method === 'GET') {
      const q = req.query || {};
      let rows;
      if (q.all === '1') {
        if (!(await checkAdmin(sql, req))) return send(res, 401, { ok: false, error: 'Solo el admin ve todos los viajes.' });
        rows = await sql`SELECT * FROM trips ORDER BY created_at DESC LIMIT 200`;
      } else if (q.pending === '1') {
        rows = await sql`SELECT * FROM trips WHERE status = 'pendiente' ORDER BY created_at ASC LIMIT 100`;
      } else if (q.driverId) {
        rows = await sql`SELECT * FROM trips WHERE driver_id = ${String(q.driverId)} AND status IN ('aceptado','llegado') ORDER BY created_at ASC`;
      } else if (q.tel) {
        rows = await sql`SELECT * FROM trips WHERE tel = ${String(q.tel).trim()} ORDER BY created_at DESC LIMIT 20`;
      } else {
        return send(res, 400, { ok: false, error: 'Falta pending, tel o driverId.' });
      }
      const map = await loadDriversMap(sql, rows.map(r => r.driver_id));
      // En pendientes el teléfono del pasajero va tapado; el chofer lo ve completo solo al aceptar.
      const trips = rows.map(t => {
        const out = publicTrip(t, map[t.driver_id] || null);
        if (t.status === 'pendiente') { out.tel = maskPhone(t.tel); if (out.otra) out.otra.tel = maskPhone(out.otra.tel); }
        return out;
      });
      return send(res, 200, { ok: true, trips });
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      const nombre = String(b.nombre || '').trim();
      const tel = String(b.tel || '').trim();
      const destino = String(b.destino || '').trim();
      if (!nombre || !tel || !destino) return send(res, 400, { ok: false, error: 'Falta nombre, teléfono o destino.' });
      const gps = b.gps || null;
      if (!gps && !String(b.ref || '').trim()) {
        return send(res, 400, { ok: false, error: 'Falta la ubicación (GPS) o una referencia de dónde te recogen.' });
      }
      let otraNombre = '', otraTel = '';
      if (b.otra) { otraNombre = String(b.otra.nombre || ''); otraTel = String(b.otra.tel || ''); if (!otraTel) return send(res, 400, { ok: false, error: 'Si pides para otra persona, su teléfono es obligatorio.' }); }
      let cuando = 'ahora', fecha = null;
      if (b.cuando === 'programado') {
        if (!b.fecha) return send(res, 400, { ok: false, error: 'Pon el día y la hora del viaje programado.' });
        fecha = new Date(b.fecha);
        if (isNaN(fecha) || fecha < new Date()) return send(res, 400, { ok: false, error: 'Esa fecha ya pasó. Pon una fecha futura.' });
        cuando = 'programado';
      }
      const id = uid();
      const code = code4();
      await sql`INSERT INTO trips (id, code, nombre, tel, destino, ref, personas, carga, billete, cambio, mascota, otra_nombre, otra_tel, cuando, fecha, gps_lat, gps_lng, status, disc)
        VALUES (${id}, ${code}, ${nombre}, ${tel}, ${destino}, ${String(b.ref || '')}, ${parseInt(b.personas || 1, 10) || 1},
        ${String(b.carga || '')}, ${String(b.billete || '')}, ${String(b.cambio || '')}, ${!!b.mascota},
        ${otraNombre}, ${otraTel}, ${cuando}, ${fecha ? fecha.toISOString() : null},
        ${gps ? gps.lat : null}, ${gps ? gps.lng : null}, 'pendiente', ${String(b.disc || 'ninguna')})`;
      return send(res, 200, { ok: true, id, code, message: cuando === 'programado' ? 'Viaje programado.' : '¡Pedido enviado a todos los mototaxistas!' });
    }

    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const id = String(b.id || '');
      const action = String(b.action || '');
      if (!id || !action) return send(res, 400, { ok: false, error: 'Falta el viaje o la acción.' });
      const rows = await sql`SELECT * FROM trips WHERE id = ${id}`;
      if (!rows.length) return send(res, 404, { ok: false, error: 'Viaje no encontrado.' });
      const trip = rows[0];
      const tel = String(b.tel || '').trim();

      if (action === 'accept') {
        if (trip.status !== 'pendiente') return send(res, 400, { ok: false, error: 'Ese viaje ya lo aceptó otro chofer.' });
        const d = await sql`SELECT * FROM drivers WHERE tel = ${tel} AND status = 'aprobado' LIMIT 1`;
        if (!d.length) return send(res, 403, { ok: false, error: 'Solo un chofer aprobado puede aceptar.' });
        await sql`UPDATE trips SET status = 'aceptado', driver_id = ${d[0].id}, precio = ${String(b.precio || '$10')}, eta = ${String(b.eta || '10')} WHERE id = ${id}`;
        return send(res, 200, { ok: true, code: trip.code, driver: publicDriver(d[0], true) });
      }
      if (action === 'arrived' || action === 'completed' || action === 'cancel') {
        // Solo el chofer que aceptó (o el admin) puede mover el viaje.
        const isAdmin = await checkAdmin(sql, req);
        const d = tel ? await sql`SELECT * FROM drivers WHERE tel = ${tel} LIMIT 1` : [];
        if (!isAdmin && (!d.length || d[0].id !== trip.driver_id)) {
          return send(res, 403, { ok: false, error: 'Solo el chofer que aceptó puede hacer eso.' });
        }
        const status = action === 'arrived' ? 'llegado' : action === 'completed' ? 'completado' : 'cancelado';
        await sql`UPDATE trips SET status = ${status} WHERE id = ${id}`;
        return send(res, 200, { ok: true, status });
      }
      return send(res, 400, { ok: false, error: 'Acción no válida.' });
    }
    return methodNotAllowed(res, 'GET, POST, PATCH');
  } catch (e) {
    return send(res, e.status || 500, { ok: false, error: String(e.message || e) });
  }
};
