# Copas Noventeros FC Gamers

Web para organizar torneos online de FC26 entre amigos: inscripción con validación,
sorteos animados de equipos/asignación/grupos, tabla de posiciones, goleo, llave de
playoffs, exportación a CSV y panel de administrador con PIN. Todo en tiempo real,
sin necesidad de cuenta de Claude — cualquiera con el link puede entrar.

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

Esto mantiene el mismo nivel de "confianza entre amigos" que ya tenías con el PIN de
administrador (cualquiera con el link puede leer/escribir, igual que antes) — es apropiado
para un torneo casual, no para datos sensibles.

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

1. En tu repositorio de GitHub: **Settings → Pages**.
2. En "Source" elige la rama **main** y la carpeta **/ (root)**.
3. Guarda. En 1-2 minutos tu sitio estará en:
   `https://TU-USUARIO.github.io/copas-noventeros-fc-gamers/`

Ese es el link que compartes con tus amigos — se abre como cualquier página web, sin
necesidad de cuenta de Claude ni de nada especial.

## 4. Primer uso

1. Abre el link → pestaña **Admin** → crea tu PIN de administrador.
2. **Admin → Torneos** → crea tu torneo (nombre, formato 8/16/32, fechas) → queda activo.
3. Comparte el link. Tus amigos entran directo a **Inscribirme**.
4. Cuando tengas suficientes inscritos: **Admin → Panel** → cerrar inscripciones →
   **Admin → Sorteos** → equipos → asignación → grupos.
5. Carga marcadores desde la pestaña **Torneo**, exporta el CSV cuando quieras desde
   **Admin → Panel** o **Admin → Torneos**.

## Cómo se publica la web

La web **no se actualiza sola al hacer merge**. `main` puede avanzar todo lo que quieras;
el sitio solo cambia cuando publicas un **release**.

1. Ve a **Releases → Draft a new release**.
2. Crea una etiqueta nueva (`v1.0.1`, `v1.1.0`…), ponle título y describe los cambios.
3. **Publish release** → el workflow *Publicar* despliega en GitHub Pages en 1-2 minutos.

Si necesitas volver a publicar sin crear un release, entra en **Actions → Publicar →
Run workflow**.

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
assets/bg.jpg        → imagen de fondo
```

## Notas honestas

- El "PIN" de administrador es una protección simple (no es seguridad real tipo login).
  Suficiente para un torneo entre amigos, no para datos sensibles.
- Las reglas de Firestore de arriba son abiertas (cualquiera con el link técnico de tu
  base de datos podría leer/escribir directo si buscara la URL de la API). Para un
  torneo casual esto es aceptable; si más adelante quieres cerrarlo más, se puede
  agregar autenticación de Firebase (Google/email) — avísame si llegas a ese punto.
- La lista de clubes/países válidos para FC26 es editable desde **Admin → Lista válida**
  por si algún nombre no calza exacto con el roster real del juego.
# copa-noventeros-fc-gamers
