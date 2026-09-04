# Roadmap

Estado de los sub-proyectos en curso. **Una línea de estado por sub-proyecto, nada más.**
El detalle de cada uno vive en su spec; aquí solo se sabe en qué punto está y cómo
comprobarlo sin creerle a este archivo.

Estados: `idea` → `brainstorm` → `spec` → `plan` → `en curso` → `hecho`

## Sub-proyectos

Orden: **A → B → C → D**. B, C y D son casi independientes entre sí una vez que A está de pie.

### A · Multi-torneo con código de invitación
**Estado:** hecho · **Depende de:** — · **Spec:** [design](docs/superpowers/specs/2026-09-03-A-multi-torneo-invitacion-design.md) · **Plan:** [6 tareas](docs/superpowers/plans/2026-09-03-A-multi-torneo-invitacion.md)

Cuenta Google **solo para el organizador** (`ownerUid`); el jugador entra con `joinCode`
sin cuenta y queda en `localStorage`. Vista nueva "Mis torneos" con los activos a los que
pertenezco. `meta/config` se reduce a `validTeams`. Reglas de Firestore siguen abiertas:
la cuenta evita que un torneo quede huérfano, no es seguridad.

**Verificación:** `grep -c 'joinCode' app.js` debe ser > 0, y `grep -c 'INDEX.adminPin' app.js`
debe ser 0. Las dos menciones sueltas de `adminPin` que quedan en `loadIndex()` son el
comentario y la lectura del documento heredado — no son estado que la app use.

Validado en producción (v1.1.0–v1.1.2): dos organizadores con cuentas de Google distintas,
cada uno dueño de su propio torneo (`ownerUid` aislado, confirmado leyendo Firestore
directamente). Ajustes posteriores sobre esta base: etiqueta ORGANIZAS/JUEGAS derivada de
la sesión activa en vez de un rol cacheado por dispositivo, status bar y scrollbar en modo
PWA instalada, y campos de fecha precargados con hoy en el formulario de creación.

### B · Sorteo visible para todos
**Estado:** hecho · **Depende de:** A · **Spec:** [design](docs/superpowers/specs/2026-09-04-B-sorteo-visible-design.md) · **Plan:** [5 tareas](docs/superpowers/plans/2026-09-04-B-sorteo-visible.md)

Sorteo **reproducido**, no en vivo: el resultado ya está en Firestore y el jugador lo ve
animado cuando entra. Se parten `runDrawTeams`/`runDrawAssign`/`runDrawGroups` en
`sortearX()` (decide) + `animarX(resultado)` (pinta); el admin usa ambas, el jugador solo
la segunda. Drawer fijo abajo que avisa de cada etapa nueva y lleva a una subpestaña
`Sorteo` propia; las animaciones en secuencia continua y botón permanente para repetir.
El resultado se deriva del documento: cero campos nuevos en Firestore. Incluye bajar la
velocidad de grupos (hoy 220ms y en Liga se acelera hasta 40ms por jugador — ilegible).

**Verificación:** `grep -n 'reproducirSorteo' app.js` debe mostrarla llamada desde la pestaña
del jugador, no solo desde admin. Más `node tools/check-sorteo.mjs`.

### C · Alias protegido
**Estado:** hecho · **Depende de:** A · **Spec:** [design](docs/superpowers/specs/2026-09-04-C-alias-protegido-design.md) · **Plan:** [6 tareas](docs/superpowers/plans/2026-09-04-C-alias-protegido.md)

Registro global `meta/aliases/{alias}` con código de protección. Mismo dispositivo: sale
de `localStorage`, invisible. Otro dispositivo: pide el código. Da sentido al salón de la
fama común — "ElCraque22" es siempre la misma persona. Con las reglas abiertas el código
es legible: **no es seguridad**, es el mismo tope de velocidad que el PIN, y así hay que
nombrarlo en la UI.

**Verificación:** `grep -n 'misAlias\|meta.,.aliases' app.js` — vacío significa que C no
está hecho. (No sirve buscar `localStorage` a secas: A ya lo usa para `misTorneos`.)

### D · Notificaciones sin infraestructura
**Estado:** brainstorm · **Depende de:** A · **Spec:** —

Tres capas, todas gratis, todas sobre el `onSnapshot` que ya existe:
1. Mirando la app → **toast**.
2. App en segundo plano → **`showNotification()`**, sin FCM. En iOS funciona mucho peor:
   el navegador suspende el JS rápido.
3. Volviendo después → **"novedades desde tu última visita"**, comparando contra
   `localStorage.ultimaVista`.

**Verificación:** `grep -n 'showNotification' app.js` — vacío significa que la capa 2 no
está hecha.

### E · Push con la app cerrada — **no se hace**
**Estado:** descartado (reevaluar tras un torneo real con D)

FCM es gratis y sin límite; el costo está en **quién dispara el envío**, porque firmar el
push exige una credencial de servicio que no puede vivir en el navegador. Opciones, ya
evaluadas: Cloud Function de Firebase (plan Blaze → tarjeta registrada, factura real $0)
o un endpoint propio en Cloudflare Workers/Deno Deploy (gratis y sin tarjeta, pero es un
segundo proveedor que mantener y el repo deja de ser solo archivos estáticos).

Se descarta porque la capa 3 de D cubre casi el mismo caso —"cerré todo y quiero
enterarme igual"— sin infraestructura. Se reabre si después de correr un torneo real
resulta que hace falta.

## Protocolo de inicio de sesión

Al abrir sesión en este repo, antes de tocar nada:

1. Leer este archivo.
2. Correr la línea de **Verificación** de cada sub-proyecto que no esté en `idea` ni en `hecho`.
3. Si el estado declarado y lo que dice el código no coinciden, **gana el código**: corregir
   el estado aquí y avisarlo en la primera respuesta.
4. Resumir en dos líneas: qué está en curso y cuál es el siguiente paso.

## Protocolo de cierre de sesión

Antes de cerrar, si el trabajo de la sesión movió algún sub-proyecto:

1. Actualizar su **Estado** y su **Spec** en este archivo.
2. Actualizar la línea de **Verificación** si el trabajo la volvió falsa
   (una verificación que ya no distingue "hecho" de "no hecho" es peor que ninguna).
3. Un sub-proyecto pasa a `hecho` solo cuando su verificación lo confirma, no cuando
   la implementación "se ve terminada".
4. Commitear este archivo junto con el trabajo.
