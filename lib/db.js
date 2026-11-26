// LLE-VA-ME — ayuda común del servidor.
// Lee la base de datos SOLO de la variable de entorno DATABASE_URL (Vercel).
// Nunca hay claves ni contraseñas escritas en el código.
const { neon } = require('@neondatabase/serverless');

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    const e = new Error('Falta DATABASE_URL en las variables de entorno de Vercel.');
    e.status = 500;
    throw e;
  }
  return neon(url);
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS drivers (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      tel TEXT NOT NULL,
      foto TEXT DEFAULT '',
      foto_taxi TEXT DEFAULT '',
      color TEXT DEFAULT '',
      modelo TEXT DEFAULT '',
      pais TEXT DEFAULT 'México',
      estado TEXT DEFAULT 'Yucatán',
      colonia TEXT DEFAULT '',
      pueblo TEXT DEFAULT '',
      rango TEXT DEFAULT 'pueblo',
      horario TEXT DEFAULT '',
      urgencia BOOLEAN DEFAULT FALSE,
      ine BOOLEAN DEFAULT FALSE,
      status TEXT DEFAULT 'pendiente',
      verificado BOOLEAN DEFAULT FALSE,
      badges TEXT DEFAULT '[]',
      disponible BOOLEAN DEFAULT TRUE,
      note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      nombre TEXT NOT NULL,
      tel TEXT NOT NULL,
      destino TEXT NOT NULL,
      ref TEXT DEFAULT '',
      personas INTEGER DEFAULT 1,
      carga TEXT DEFAULT '',
      billete TEXT DEFAULT '',
      cambio TEXT DEFAULT '',
      mascota BOOLEAN DEFAULT FALSE,
      otra_nombre TEXT DEFAULT '',
      otra_tel TEXT DEFAULT '',
      cuando TEXT DEFAULT 'ahora',
      fecha TIMESTAMPTZ NULL,
      gps_lat DOUBLE PRECISION NULL,
      gps_lng DOUBLE PRECISION NULL,
      status TEXT DEFAULT 'pendiente',
      driver_id TEXT DEFAULT '',
      precio TEXT DEFAULT '',
      eta TEXT DEFAULT '',
      disc TEXT DEFAULT 'ninguna',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      kind TEXT DEFAULT 'chofer',
      stars INTEGER NOT NULL,
      anon BOOLEAN DEFAULT FALSE,
      txt TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      target TEXT NOT NULL,
      why TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY,
      tel TEXT NOT NULL,
      nombre TEXT NOT NULL,
      destino TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (tel, destino)
    )`;
  await sql`
    CREATE TABLE IF NOT EXISTS admin_settings (
      id INTEGER PRIMARY KEY,
      password_hash TEXT DEFAULT '',
      salt TEXT DEFAULT '',
      session_token TEXT DEFAULT '',
      session_expires TIMESTAMPTZ NULL
    )`;
  // Columnas nuevas si la tabla ya existía de una versión anterior.
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS note TEXT DEFAULT ''`;
  await sql`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS badges TEXT DEFAULT '[]'`;
  await sql`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS session_token TEXT DEFAULT ''`;
  await sql`ALTER TABLE admin_settings ADD COLUMN IF NOT EXISTS session_expires TIMESTAMPTZ NULL`;
}

// Lee el cuerpo JSON de la petición (Vercel no lo parsea solo en CommonJS).
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function send(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function methodNotAllowed(res, allowed) {
  return send(res, 405, { ok: false, error: 'Método no permitido. Usa: ' + allowed });
}

// Token de admin: se guarda en la base de datos, no en el código.
async function checkAdmin(sql, req) {
  const token = req.headers['x-admin-token'] || '';
  if (!token) return false;
  const rows = await sql`SELECT session_token, session_expires FROM admin_settings WHERE id = 1`;
  if (!rows.length) return false;
  if (rows[0].session_token !== token) return false;
  if (rows[0].session_expires && new Date(rows[0].session_expires) < new Date()) return false;
  return true;
}

function maskPhone(p) {
  p = String(p || '');
  return p.length > 4 ? '*** *** ' + p.slice(-4) : '***';
}

// Quita la foto de perfil / taxi en listados públicos si es muy pesada:
// se devuelve igual, pero el servidor nunca devuelve la foto del INE
// (solo se guarda si subió o no: campo ine = true/false).
function publicDriver(d, full) {
  const badges = (() => { try { return JSON.parse(d.badges || '[]'); } catch { return []; } })();
  const out = {
    id: d.id, nombre: d.nombre, foto: d.foto || '', foto_taxi: d.foto_taxi || '',
    color: d.color, modelo: d.modelo, pueblo: d.pueblo, horario: d.horario,
    rango: d.rango, urgencia: !!d.urgencia, status: d.status,
    verificado: !!d.verificado, badges, disponible: d.disponible !== false,
    created_at: d.created_at
  };
  if (full) {
    out.tel = d.tel; out.pais = d.pais; out.estado = d.estado;
    out.colonia = d.colonia; out.ine = !!d.ine; out.note = d.note || '';
  } else {
    out.tel = maskPhone(d.tel);
  }
  return out;
}

function publicTrip(t, driver) {
  return {
    id: t.id, code: t.code, nombre: t.nombre, tel: t.tel, destino: t.destino,
    ref: t.ref || '', personas: t.personas, carga: t.carga || '',
    billete: t.billete || '', cambio: t.cambio || '', mascota: !!t.mascota,
    otra: (t.otra_tel || t.otra_nombre) ? { nombre: t.otra_nombre || '', tel: t.otra_tel || '' } : null,
    cuando: t.cuando, fecha: t.fecha, gps: (t.gps_lat != null && t.gps_lng != null) ? { lat: t.gps_lat, lng: t.gps_lng } : null,
    status: t.status, driverId: t.driver_id || '', precio: t.precio || '', eta: t.eta || '',
    disc: t.disc || 'ninguna', created: t.created_at,
    driver: driver ? publicDriver(driver, true) : null
  };
}

module.exports = { getSql, ensureSchema, readBody, send, methodNotAllowed, checkAdmin, maskPhone, publicDriver, publicTrip };
