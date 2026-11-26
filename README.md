# LLE-VA-ME — Versión compartida

Mototaxis de Homún, Yucatán. **“Ya no busques taxi. Solo pídelo y llega por ti.”**

Esta es la versión **compartida**: un chofer que se registra en su celular
aparece en el celular de todos los pasajeros, y un pedido hecho en un celular
le llega a todos los choferes. Los datos viven en **Neon (Postgres)** y la
página vive en **Vercel**.

> ⚠️ No subas aquí ninguna contraseña ni la `DATABASE_URL`. Esa clave solo se
> pega en Vercel (paso 3), nunca en GitHub ni en el chat.

## Qué hay en esta carpeta

| Archivo | Para qué |
|---|---|
| `index.html` | La app completa (un solo archivo, en español, azul #1D6FB8 / verde #1F9D66). Llama a `/api/...`, ya no usa localStorage para choferes ni viajes. |
| `package.json` | Solo una dependencia: `@neondatabase/serverless`. Sin framework pesado. |
| `vercel.json` | Configuración mínima de Vercel. |
| `.gitignore` | Para no subir `node_modules` ni `.env`. |
| `lib/db.js` | Conexión a Neon (lee `DATABASE_URL` del entorno) y creación de tablas. |
| `api/setup.js` | `GET /api/setup` — crea las tablas una vez. |
| `api/health.js` | `GET /api/health` — ¿está puesta `DATABASE_URL` y responde la base? |
| `api/drivers.js` | Choferes: listar aprobados, nocturnos, registrar, panel, disponibilidad, aprobar/rechazar (admin). |
| `api/trips.js` | Viajes: crear, pendientes, mis viajes, aceptar, ya llegué, completado. |
| `api/admin.js` | Contraseña del dueño con scrypt (servidor). Crear / entrar / cambiar / salir. |
| `api/reviews.js` | Estrellas y opiniones. |
| `api/reports.js` | Reportes (solo los lee el admin). |
| `api/places.js` | Destinos frecuentes de cada pasajero (por su teléfono). |

Tablas en Neon: `drivers`, `trips`, `reviews`, `reports`, `places`, `admin_settings`.
Se crean solas con `CREATE TABLE IF NOT EXISTS` (en `/api/setup` y en cada
llamada, por seguridad).

## Lo que debe hacer JOSE, paso a paso

Hazlo de un jalón, sin salirte a cada rato (si sales, la página se puede
reiniciar en el celular).

### 1) Subir estos archivos a GitHub (reemplazando el `index.html` viejo)

1. Entra a tu repositorio: https://github.com/Joseeduardoespinosachi/LLE-VA-ME
2. **Borra el `index.html` viejo** (pícalo → los 3 puntos `...` → `Delete file` →
   `Commit changes`). Si no lo borras, el viejo se queda.
3. Pica **Add file → Upload files** y sube **todos** los archivos de esta
   carpeta, manteniendo las carpetas `api/` y `lib/` como están. No cambies
   nombres. Sube los archivos sueltos, en una sola subida (GitHub no
   descomprime archivos ZIP, así que no subas un ZIP).
4. Pica **Commit changes**.

### 2) Esperar el despliegue en Vercel

Vercel detecta el cambio en GitHub solo y vuelve a desplegar
(`lle-va-me.vercel.app`). Espera 1-2 minutos. Si pasan 5 minutos y no cambia
nada, entra a Vercel → tu proyecto `lle-va-me` → **Deployments** → el de
arriba debe decir **Ready**.

### 3) Poner la `DATABASE_URL` en Vercel (solo tú, no se la pases a nadie)

1. Entra a **Neon** (tu proyecto **LLE-VA-ME**, región Ohio) → **Dashboard** →
   **Connection string** → **copiar**. Esa es tu `DATABASE_URL`.
   Empieza con `postgres://...` y lleva una contraseña dentro: **no la pegues
   en el chat, ni en GitHub, ni en WhatsApp**.
2. Entra a **Vercel** → proyecto `lle-va-me` → **Settings** →
   **Environment Variables**.
3. En **Key** escribe exactamente: `DATABASE_URL`
4. En **Value** pega la cadena que copiaste de Neon.
5. Marca los 3 ambientes (Production, Preview, Development) y pica **Save**.
6. Vuelve a **Deployments** → los 3 puntos `...` del último despliegue →
   **Redeploy** → **Redeploy**. Sin este paso, la variable no entra.

### 4) Crear las tablas (una sola vez)

Abre en tu celular o computadora:

```
https://lle-va-me.vercel.app/api/setup
```

Debe decir `{"ok":true,"message":"Tablas listas..."}`.
Si dice `Falta DATABASE_URL`, vuelve al paso 3 (la variable no quedó o falta
el Redeploy).

Para comprobar la conexión también puedes abrir:

```
https://lle-va-me.vercel.app/api/health
```

Debe decir `{"ok":true,"db":true,...}`.

### 5) Probar con 2 celulares

1. **Celular A (tú, admin):** abre el link → pestaña **Admin** → crea tu
   contraseña de admin → **escríbela en papel, no se puede recuperar**.
2. **Celular B (chofer de prueba):** abre el link → pestaña **Mototaxista** →
   regístrate con nombre, teléfono, foto, color y modelo.
3. **Celular A:** Admin → chofer pendiente → **Aceptar**.
4. **Celular B:** Mototaxista → **Ver mi panel** → pon su teléfono → debe
   decir **✅ Aprobado**.
5. **Celular A (o un tercer celular, pasajero):** crea tu cuenta de pasajero,
   pica **📍 Usa mi ubicación actual**, pon destino (ej: iglesia) y
   **Pedir mi mototaxi**.
6. **Celular B:** Mototaxista → **Ver mi panel** → debe salir el pedido →
   **Aceptar este viaje** → **Ya llegué** → **Viaje completado**.
7. **Celular del pasajero:** en **Mis viajes** debe cambiar a Aceptado y luego
   a “¡Tu mototaxi ya está afuera!”.

Si en el paso 5 el pedido no sale en el celular B, espera 12 segundos (la app
se actualiza sola cada 12 segundos) y recarga la página.

## Cómo funciona por dentro (resumen)

- **Pasajero:** su perfil (teléfono + discapacidad) se guarda solo en su
  celular (localStorage). Su pedido va a `/api/trips` y queda en Neon.
- **Chofer:** su registro va a `/api/drivers` y queda **pendiente**. El admin
  lo aprueba en `/api/admin` + `/api/drivers`. Cada 12 segundos su panel
  vuelve a pedir `/api/trips?pending=1`.
- **Admin:** su contraseña se guarda con **scrypt + sal** en `admin_settings`.
  Al entrar, el servidor le da un token (30 días) que su celular guarda; con
  ese token puede aprobar choferes y leer reportes.
- **Privacidad:** el teléfono del pasajero va tapado (`*** *** 4567`) en los
  pedidos pendientes; el chofer lo ve completo solo cuando acepta. La
  ubicación GPS exacta solo la ve el chofer que aceptó. La foto del INE **no
  se guarda** en la base de datos, solo se guarda si la subió o no.
- **Fotos:** la foto de perfil y la del mototaxi se achican en el celular
  (máx. 800 px, JPEG) y se guardan como texto en la base de datos, con límite
  de ~700 KB por foto.

## Si algo sale mal

| Lo que ves | Qué hacer |
|---|---|
| `/api/setup` dice `Falta DATABASE_URL` | La variable no está en Vercel o falta el Redeploy (paso 3). |
| La app abre pero dice “No se pudo cargar la lista de choferes” | Abre `/api/setup` una vez (paso 4). |
| “La contraseña de admin ya existe” | Ya la creaste antes: entra con ella en Admin. Si la olvidaste, no se recupera: en Neon borra la fila de `admin_settings` (`DELETE FROM admin_settings WHERE id=1;`) y vuelve a crearla. |
| “Project already exists” en Vercel | Ya existe, no crees otro: entra a tu panel de Vercel y abre el proyecto `lle-va-me`. |
| El pedido no llega al chofer | Espera 12 segundos y recarga. Revisa que el chofer esté **Aprobado** y **Disponible**. |

## Limitaciones que quedan (a propósito, para empezar)

- **Sin notificaciones push reales:** la app se actualiza cada 12 segundos
  sola (polling). El chofer debe tener la app abierta para ver pedidos nuevos.
- **Fotos como texto en la base de datos:** funciona para empezar, pero si
  hay muchos choferes con fotos grandes la base se llena. El siguiente paso
  sería guardar fotos en un almacén de archivos (por ejemplo, Neon Object
  Storage o similar).
- **Sin pagos con tarjeta:** solo efectivo, como se acordó.
- **Sin mapa en vivo:** la ubicación se muestra como coordenadas al chofer
  que acepta; no hay seguimiento en mapa todavía.
- Los datos viejos de la versión estática (los que estaban solo en cada
  celular) **no** se pasan a esta versión: los choferes deben registrarse de
  nuevo y JOSE debe crear su contraseña de admin de nuevo.
