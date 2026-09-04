# Copas Noventeros FC Gamers

Web para organizar torneos online de FC26 entre amigos: inscripción con validación,
sorteos animados de equipos/asignación/grupos, tabla de posiciones, goleo, llave de
playoffs, exportación a CSV y panel de administrador. Cada organizador entra con su
cuenta de Google y puede llevar varios torneos a la vez; los jugadores no necesitan
cuenta — se unen pegando el código del torneo. Todo en tiempo real, sin necesidad de
cuenta de Claude.

No requiere backend propio: usa **Firebase Firestore** (base de datos gratuita de
Google) para guardar los datos en tiempo real, y se hospeda gratis en **GitHub Pages**.

## 1. Crear el proyecto de Firebase (gratis, ~5 minutos)

1. Ve a **https://console.firebase.google.com** e inicia sesión con una cuenta de Google.
2. Clic en **"Crear un proyecto"**, ponle un nombre (ej: `copas-noventeros`) y sigue los pasos
   (puedes desactivar Google Analytics, no lo necesitas).
3. Dentro del proyecto, en el menú izquierdo: **Compilación → Firestore Database → Crear base de datos**.
   - Elige la ubicación más cercana a ti/tus amigos.
   - Empieza en **"modo de prueba"** (reglas abiertas por 30 días) — más abajo te dejo
     reglas permanentes simples para cuando quieras cerrarlo un poco más.
4. Ve a **⚙️ Configuración del proyecto** (el engranaje, arriba a la izquierda) → pestaña **General**.
5. Baja hasta **"Tus apps"** → clic en el ícono **`</>`** (Web) → ponle un apodo (ej: `web`) → **Registrar app**.
6. Firebase te muestra un bloque de código con un objeto `firebaseConfig`. Copia esos valores
   (apiKey, authDomain, projectId, etc.) y pégalos en el archivo **`firebase-config.js`** de este
   proyecto, reemplazando los valores de ejemplo.

   > ⚠️ **Conserva la palabra `export`**: el archivo debe decir
   > `export const firebaseConfig = {…}`. Firebase te muestra el bloque sin ella, así que
   > si pegas encima y la borras, la web se queda en blanco al abrirla.

   > ✅ Es normal y seguro que esta `apiKey` quede visible en tu repositorio público de GitHub.
   > No es una contraseña: es solo un identificador del proyecto. La seguridad real la dan las
   > **reglas de Firestore** (paso siguiente).

### Reglas de Firestore recomendadas

Ve a **Firestore Database → Reglas** y pega esto (permite leer/escribir solo las colecciones
que usa la app, sin exponer el resto de tu proyecto):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /meta/{docId} {
      allow read, write: if true;
    }
    match /tournaments/{docId} {
      allow read, write: if true;
    }
  }
}
```

Esto mantiene la misma "confianza entre amigos" de siempre (cualquiera con el link puede
leer/escribir) — es apropiado para un torneo casual, no para datos sensibles. La cuenta de
Google del organizador (paso siguiente) no cambia esto: sirve para saber quién es dueño de
cada torneo, no como seguridad.

### Habilitar el inicio de sesión con Google

Los organizadores entran con su cuenta de Google; los jugadores nunca se autentican. Para
que el botón "Entrar con Google" funcione hacen falta dos pasos manuales en la consola de
Firebase (esto no lo puede hacer el código):

1. **Authentication → Sign-in method** → habilita el proveedor **Google**.
2. **Authentication → Settings → Authorized domains** → agrega el dominio donde vas a
   publicar la web (el de GitHub Pages del paso 3, ej. `soyhares.github.io`). Sin esto el
   login falla con un error de dominio no autorizado.

## 2. Subir el proyecto a GitHub

Desde una terminal, dentro de esta carpeta:

```bash
git init
git add .
git commit -m "Copas Noventeros FC Gamers"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/copas-noventeros-fc-gamers.git
git push -u origin main
```

(Crea antes el repositorio vacío en GitHub: **github.com → New repository**, sin
README ni .gitignore para evitar conflictos con estos archivos).

## 3. Publicar con GitHub Pages (gratis)

Ya está configurado: **Settings → Pages** usa "GitHub Actions" como origen, y el
despliegue lo hace el workflow *Publicar* cuando creas un release (ver más abajo).
El sitio queda en:
`https://soyhares.github.io/copa-noventeros-fc-gamers/`

Ese es el link que compartes con tus amigos — se abre como cualquier página web, sin
necesidad de cuenta de Claude ni de nada especial.

## 4. Primer uso

1. Abre el link → pestaña **Mis torneos** → **Entrar con Google**.
2. **Crear torneo** (nombre, modalidad, fechas) → queda activo y te muestra su
   **código de invitación** (ej. `NOV-4K2P`) para compartir.
   - **Copa**: formato 8/16/32 → grupos de 4 → llave de playoffs. Si se inscriben menos
     de los previstos, el formato baja solo y los que sobran quedan como suplentes.
   - **Liga**: todos contra todos, solo ida o ida y vuelta. Sin límite de jugadores
     (o con un cupo máximo, si lo pones). Mínimo 3 inscritos. El empate es un
     resultado válido y gana quien termine primero en la tabla.
3. Comparte el link con el código, o el link con el código ya incluido
   (`?j=NOV-4K2P`). Tus amigos no necesitan cuenta: pegan el código en **Mis torneos**
   → **Unirme al torneo** y quedan directo en **Inscribirme**.
4. Cuando tengas suficientes inscritos: entra a tu torneo → **Panel** → cerrar
   inscripciones → **Sorteos** → equipos → asignación → grupos (Copa) o calendario (Liga).
5. Carga marcadores desde la pestaña **Torneo**. Al completarse todos los partidos,
   **Sorteos** ofrece generar la llave (Copa) o coronar al campeón (Liga).
6. Exporta el CSV cuando quieras desde el **Panel** de tu torneo.

Un mismo organizador puede llevar varios torneos a la vez: todos aparecen en
**Mis torneos**, marcados como "ORGANIZAS". Los torneos a los que solo te uniste como
jugador aparecen ahí también, marcados como "JUEGAS".

## Cómo se publica la web

La web **no se actualiza sola al hacer merge**. `main` puede avanzar todo lo que quieras;
el sitio solo cambia cuando publicas un **release**.

1. Ve a **Releases → Draft a new release**.
2. Crea una etiqueta nueva (`v1.0.1`, `v1.1.0`…), ponle título y describe los cambios.
3. **Publish release** → el workflow *Publicar* despliega en GitHub Pages en 1-2 minutos.

Si necesitas volver a publicar sin crear un release, entra en **Actions → Publicar →
Run workflow**.

> ⚠️ **Si cambias index.html, style.css o app.js**, sube también el número de `VERSION`
> en `sw.js` (`copas-v1` → `copas-v2`). El service worker guarda copias de esos archivos
> y así se asegura de que todos reciban la versión nueva.
>
> **Antes de publicar el release**, actualiza también el número que se ve junto al
> título en `index.html` (`<span class="ver">v1.0.x</span>`) para que coincida con la
> etiqueta del release.

## Instalar como app (PWA)

La web se puede instalar en el móvil o el escritorio:

- **Android/Chrome**: menú ⋮ → *Instalar aplicación*.
- **iPhone/Safari**: botón compartir → *Añadir a pantalla de inicio*.
- **Escritorio**: el icono de instalar en la barra de direcciones.

Una vez instalada aparece como **FC Gamers90** en la pantalla de inicio, se abre sin la barra del
navegador y **el diseño carga sin conexión**. Los datos del torneo sí necesitan internet: vienen de
Firestore en tiempo real.

(Dentro de la app la marca se lee NOVENTEROS FC GAMERS. Los dos nombres son a propósito — ver
[MARCA.md](MARCA.md#01-esencia-de-marca).)

## Cómo contribuir (para mis amigos)

No hace falta que te dé permisos: se trabaja por **fork**.

1. Botón **Fork** arriba a la derecha → tendrás tu propia copia.
2. Haz tus cambios ahí (en tu fork puedes trabajar directo en `main`).
3. **Contribute → Open pull request** hacia este repo.
4. Cada PR pasa un chequeo automático y necesita mi aprobación antes de entrar.

Consejos para que el PR pase a la primera:

- **No toques `firebase-config.js`** salvo que sepas lo que haces: si se pierde la palabra
  `export` del principio, la web se abre en blanco. El chequeo lo detecta y falla.
- Prueba en local con `python3 -m http.server` y abre `http://localhost:8000`
  (abrir el `index.html` directo con doble clic **no funciona**: el navegador bloquea los
  módulos con `file://`).
- Toda la interfaz va en español.

## Cómo probar en local

```bash
python3 -m http.server 8000
```

Luego abre <http://localhost:8000>.

## Estructura del proyecto

```
index.html          → estructura de la página
style.css            → todos los estilos (tema oscuro + verde neón)
app.js               → toda la lógica (sorteos, grupos, llave, CSV, Firestore)
firebase-config.js   → tu configuración de Firebase (edítala, no es secreta)
assets/bg-neon.jpeg          → fondo en móvil (vertical)
assets/bg-neon-desktop.jpeg  → fondo en pantallas ≥768px (apaisado)
assets/brand/                → fuentes de marca en alta (la app NO las descarga)
assets/logo.png              → isotipo que sirve la app (topbar, hero, sello)
assets/favicon-*.png         → icono de la pestaña
assets/apple-touch-icon.png  → icono en la pantalla de inicio de iOS
assets/icon-*.png            → iconos de la app instalada (PWA)
assets/og.jpg                → vista previa al compartir el link
tools/iconos.sh              → genera todos los iconos desde assets/brand/
manifest.webmanifest         → datos de la app instalable
sw.js                        → service worker (permite abrirla sin conexión)
MARCA.md                     → libro de marca: colores, tipografía, uso del logo
```

Los iconos **no se editan a mano**: se cambia el arte en `assets/brand/` y se corre
`bash tools/iconos.sh`. Ver [MARCA.md §21](MARCA.md#21-versiones-oficiales).

## Notas honestas

- La cuenta de Google del organizador identifica quién es dueño de cada torneo; no es
  seguridad real tipo login para los datos. Suficiente para un torneo entre amigos, no
  para datos sensibles.
- Las reglas de Firestore de arriba son abiertas (cualquiera con el link técnico de tu
  base de datos podría leer/escribir directo si buscara la URL de la API, y de hecho un
  jugador se inscribe escribiendo el documento entero del torneo). Para un torneo casual
  esto es aceptable.
- La lista de clubes/países válidos para FC26 es editable desde **Admin → Lista válida**
  por si algún nombre no calza exacto con el roster real del juego.
# copa-noventeros-fc-gamers
