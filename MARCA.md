# Noventeros FC Gamers — Libro de Marca

**Fútbol. Gaming. Hermandad.**

Una identidad creada para una generación que creció jugando fútbol y videojuegos, y que ahora
convierte esa nostalgia en competencia entre amigos.

> Este documento no es decorativo: cada regla apunta al archivo o a la clase CSS donde vive.
> Si cambias una, cambia la otra.

---

## 01. Esencia de marca

Noventeros FC Gamers es una comunidad de jugadores nacidos en los años 90 que comparte una misma cultura:
el fútbol, los videojuegos, la competencia y la amistad.

La marca no busca parecer un club de fútbol tradicional ni un equipo profesional de esports. Busca
representar algo más específico: **la generación que pasó de jugar FIFA con amigos a organizar sus
propios torneos.**

El isotipo condensa esa idea en un único gesto visual: `90 + Fútbol + Gaming`. Tres códigos
diferentes, convertidos en una sola figura.

### Los dos nombres

| Nombre | Dónde vive | Archivo |
|---|---|---|
| **NOVENTEROS FC GAMERS** | el wordmark: topbar, `<title>`, hero, OG tags, camiseta | `index.html`, `app.js` |
| **FC Gamers90** | el nombre de la app instalada, bajo el icono en la pantalla de inicio | `manifest.webmanifest` |

No son alternativas: son dos capas distintas. El wordmark es la marca; `FC Gamers90` es cómo se
llama el atajo en el teléfono.

---

## 02. El isotipo

### El concepto 90

El número 90 es el corazón de la identidad. No representa un año ni una competición: **nos
representa a nosotros.** Funciona como identificador generacional y debe reconocerse incluso sin la
palabra Noventeros al lado.

### El 9

Construcción dinámica e inclinada. Transmite movimiento, velocidad, competencia, energía,
trayectoria. El trazo no necesita ser perfectamente geométrico: su ligera irregularidad aporta
personalidad y evita que la identidad se sienta corporativa o excesivamente tecnológica.

### El 0

No es simplemente un cero: es el componente futbolístico. Su estructura circular evoca un balón
mediante intersecciones y geometrías internas muy sutiles.

La intención es que no se lea *"un balón dentro de un cero"* sino *"un 90 que tiene algo de
fútbol."* Esa ambigüedad es deliberada.

---

## 03. Gaming integrado

Los cuatro símbolos clásicos del mando:

| Símbolo | Nombre | Color | HEX | CSS var |
|---|---|---|---|---|
| △ | Triangle | Green | `#31E464` | `--green` |
| □ | Square | Pink | `#D85B9B` | `--pink` |
| × | Cross | Blue | `#4C91C7` | `--blue` |
| ○ | Circle | Red | `#C94D4D` | `--red` |

**Regla fundamental:** los símbolos no deben competir con el 90. No son elementos independientes
del logo — deben sentirse parte de su construcción. Se tratan con cortes, hundimientos,
intersecciones, siluetas, espacios negativos, líneas interiores y pequeños acentos de color.

El objetivo es que pasen desapercibidos a primera vista y se descubran al observar.

> En la app, este código aparece una sola vez: el hairline de 2px bajo la topbar
> (`.topbar::after` en `style.css`), con los cuatro colores en franjas iguales al 50% de opacidad.

---

## 04. Principio de unidad

El isotipo debe percibirse como **una sola figura**, nunca como una composición de elementos
independientes.

```
NO HACER              HACER
9 + ⚽ + △□×○                    90
                              ↙     ↘
                        fútbol       gaming
```

---

## 05. Personalidad visual

**MATTE** — superficies sobrias, profundas, poco reflectivas.
**NEON** — acentos luminosos usados estratégicamente.
**PREMIUM** — contraste controlado, espacio negativo, construcción limpia.
**NOSTÁLGICA** — el 90 y los símbolos conectan con una generación.

La combinación debe sentirse **adulta, pero divertida**. No infantil, no corporativa, no
excesivamente futurista.

---

## 06. Paleta cromática

Toda la paleta vive en `:root` al inicio de `style.css`. Los HEX de abajo son la fuente de verdad:
si cambian aquí, cambian ahí.

| Nombre | HEX | CSS var | Uso |
|---|---|---|---|
| Carbon Black | `#070907` | `--bg` | fondo principal |
| Deep Green Black | `#0C110D` | `--bg2` | fondos secundarios |
| Panel Dark | `#0A0D0B` | `--panel-dark` | superficies |
| Ivory White | `#EEF2EB` | `--white` | logo y tipografía |
| Silver | `#AEB7AF` | `--silver` | información secundaria |
| Muted Green | `#879389` | `--muted` | texto secundario |
| **Neon Green** | **`#31E464`** | `--accent` | **color de marca** |

`#31E464` es el color que identifica a Noventeros FC Gamers. Debe ser el acento dominante, pero **no debe
cubrir grandes superficies**. Su función es atraer la mirada.

---

## 07. Proporción

```
70%  negro / grafito
20%  marfil / plata
10%  acentos de color
```

El verde puede superar ese porcentaje en piezas promocionales, pero el logo institucional y la app
se mantienen sobrios. Los colores de los símbolos (§03) son **acentos, no colores estructurales**.

En la práctica esto significa que una etiqueta fija va en `--silver`, no en `--accent`. El verde se
reserva para lo que cambia: un estado, un resultado, una acción.

---

## 08. Neon vs. matte

La marca mantiene una tensión entre dos mundos: **matte** es la identidad adulta, **neon** es el
gaming. Por eso el neon nunca debe convertirse en un efecto de videojuego genérico.

| Correcto | Incorrecto |
|---|---|
| una línea verde muy fina | glow excesivo |
| un borde parcialmente iluminado | resplandores alrededor de todo el logo |
| un símbolo con una pequeña emisión de luz | gradientes fluorescentes, efectos cyberpunk |

> **El neon debe parecer una luz escondida dentro de la marca, no una decoración encima de ella.**

### Regla operativa

**El neon marca estado o momento. Nunca decora una superficie en reposo.**

Es la regla que decide cada `box-shadow` verde de `style.css`:

| Lleva glow | Por qué |
|---|---|
| `.pill.live` | hay un torneo en vivo — es información |
| `.tabbar button.active` | dónde estoy ahora |
| `.draw-slot.landed`, `.flip-card.revealed` | el momento del sorteo |
| `.champ-banner h2` | el campeón; es *el* momento de la pieza |
| `.btn:hover`, `.btn:focus-visible` | el botón responde |

| No lleva glow | Por qué |
|---|---|
| `.btn` en reposo | un botón quieto no es estado ni momento |
| `.hero-logo` | §08 lo prohíbe explícitamente |
| `.section-title .num` | el borde verde fino ya lo identifica |
| `.tabs2 button.active` | el fondo `--accent-subtle` alcanza |

---

## 09. Tipografía

| Rol | Familia | Pesos | Por qué |
|---|---|---|---|
| Display / marca | **Outfit** | 600, 700 | geométrica, contemporánea, ligeramente extendida |
| Interfaz / textos | **Inter** | 400–700 | neutra y funcional; no compite con el isotipo |

Ambas se cargan desde Google Fonts en `index.html` y se exponen como `--font-display` y
`--font-ui`. El **tracking amplio es parte de la personalidad**: la marca se escribe

```
N O V E N T E R O S   F C   G A M E R S
```

---

## 10. Jerarquía tipográfica

Cuatro niveles, cuatro clases CSS (`.n1`–`.n4`, definidas junto a `:root`):

| Nivel | Clase | Ejemplo | Especificación |
|---|---|---|---|
| 01 Marca | `.n1` | NOVENTEROS / FC GAMERS | Outfit 700, mayúsculas, tracking `.18em`; dos líneas |
| 02 Títulos | `.n2`, `h1`–`h3` | COPA DESPEDIDA | Outfit 600, mayúsculas, tracking `.06em` |
| 03 Información | `.n3`, cuerpo | 13 septiembre 2026 | Inter 500, tracking `.02em` |
| 04 Metadata | `.n4` | REGISTRO · TORNEO · DIVISIÓN | Inter 600, 11px, mayúsculas, tracking `.14em` |

El Nivel 01 aparece **una sola vez por pantalla**.

---

## 11. Uso del isotipo

El isotipo debe existir independientemente del nombre. Aplicaciones: app icon, favicon, perfil
social, camiseta, gorra, trofeo, overlays de streaming, marcador, tarjetas de jugador, brackets,
tablas de posiciones, banners, thumbnails, watermark, stickers, merchandising.

El objetivo: que eventualmente **el símbolo 90 baste para reconocer a Noventeros FC Gamers.**

---

## 12. App icon

El isotipo es naturalmente cuadrado, lo que lo favorece como icono. Para la app: solo el isotipo,
sin wordmark, maximizando el área ocupada pero conservando espacio de seguridad y contraste contra
el fondo.

**Prioridad: reconocimiento > detalle.** Los elementos secundarios del balón y del gaming se
simplifican progresivamente conforme baja el tamaño.

La versión `maskable` mete el arte en un lienzo 25% más grande relleno de `#070907`, porque Android
recorta hasta un 20% por lado.

---

## 13. Favicon

A tamaños muy pequeños el isotipo evoluciona a una versión reducida. Puede conservar el
`90 + gesto futbolístico` mientras los símbolos de gaming desaparecen. **Esto no es una alteración
de la marca: es una adaptación óptica.**

> Estado actual: el favicon de 16/32 px sale del app-icon, porque el isotipo transparente tiene
> trazos finos con contorno negro que a ese tamaño se empastan. Todavía **no existe** el arte micro
> sin símbolos de gaming que pide esta sección. Cuando exista, se cambia la fuente en
> `tools/iconos.sh` y se vuelve a correr.

---

## 14. Redes sociales

- **Avatar** — el 90 aislado sobre fondo oscuro.
- **Marca de agua** — versión monocromática, opacidad baja.
- **Post** — isotipo grande, parcialmente fuera del canvas.
- **Stories / Reels** — el logo como elemento de transición, acompañando resultados, próximos
  partidos, rankings, anuncios, memes y estadísticas.

---

## 15. Torneos

En las piezas de competición el isotipo funciona como **firma institucional**. Jerarquía
recomendada:

```
NOVENTEROS
     FC GAMERS

        COPA
     DESPEDIDA

        FC26

    13 SEPTIEMBRE
```

El logo no necesita dominar la pieza: **es el sello que autentica el torneo.**

> En la app esto es la clase `.sello` de `style.css`, aplicada a la llave, a la tabla de goleo y al
> banner del campeón.

---

## 16. Camiseta

- **Pecho** — isotipo reducido.
- **Manga** — símbolo 90 simplificado.
- **Espalda** — NOVENTEROS FC GAMERS en tipografía institucional.
- **Detalles** — el verde puede aparecer en ribetes, costuras gráficas, numeración y pequeños
  elementos del isotipo.

La camiseta no debería convertirse en una explosión de neon.

---

## 17. Watermark

Para contenido de la comunidad: versión monocromática, preferentemente `#EEF2EB`, con opacidad
reducida. Debe identificar el contenido sin distraer del partido.

---

## 18. Fondos

El logo vive sobre negro carbón, verde muy oscuro, grafito o blanco marfil. También sobre
fotografía, usando en ese caso una versión con suficiente contraste.

**Nunca** colocarlo sobre una zona visualmente conflictiva sin asegurar contraste.

---

## 19. Espacio de seguridad

La unidad de seguridad es **la altura del interior del 0**. Ningún texto, borde, fotografía ni
elemento gráfico invade esa zona.

Excepción: aplicaciones deliberadamente *full bleed*, donde el isotipo puede salir del canvas como
recurso gráfico.

---

## 20. Composición

El isotipo **puede romper los límites del formato** — útil en banners, portadas, posters, stories,
headers y pantallas de inicio. El 9 puede entrar o salir del canvas; el 0 puede recortarse
parcialmente. Transmite movimiento, energía y escala.

La versión institucional siempre conserva su geometría completa.

---

## 21. Versiones oficiales

Las fuentes de marca viven en `assets/brand/` y **no las sirve la app**. Todo lo que sirve la app
lo genera `tools/iconos.sh` a partir de ellas:

```bash
bash tools/iconos.sh
```

| § | Versión | Archivo | Generado |
|---|---|---|---|
| A | Primary | `assets/brand/isotipo.png` (1254²) | fuente |
| B | Monochrome | — | pendiente |
| C | Neon | `assets/brand/hero-neon.png` | fuente, pieza promocional |
| D | Light | — | pendiente |
| E | App | `assets/brand/app-icon.png` (1254²) | fuente |
| F | Micro | — | pendiente (ver §13) |
| G | Wordmark | — | pendiente; hoy se compone con Outfit 700 |

| Archivo servido | Tamaño | Sale de | Para |
|---|---|---|---|
| `assets/logo.png` | 256² | isotipo | topbar, hero, sello |
| `assets/favicon-32.png`, `favicon-16.png` | 32², 16² | app-icon | pestaña del navegador |
| `assets/apple-touch-icon.png` | 180² | app-icon | pantalla de inicio de iOS |
| `assets/icon-192.png`, `icon-512.png` | 192², 512² | app-icon | manifest, `purpose: any` |
| `assets/icon-maskable-512.png` | 512² | app-icon | manifest, `purpose: maskable` |
| `assets/og.jpg` | 1200×630 | hero-neon | vista previa al compartir |

**No editar a mano ningún archivo de la segunda tabla.** Cambia el arte fuente y vuelve a correr el
script.

---

## 22. Lo que NO debemos hacer

El logo no debe:

- ❌ incorporar escudos tradicionales
- ❌ añadir coronas
- ❌ añadir estrellas
- ❌ utilizar trofeos como parte del isotipo
- ❌ convertirse en un balón literal
- ❌ utilizar exceso de glow
- ❌ añadir personajes
- ❌ humanizar el símbolo
- ❌ utilizar efectos 3D en la versión principal
- ❌ distorsionar arbitrariamente el 90
- ❌ separar los elementos conceptuales
- ❌ utilizar todos los colores simultáneamente sin jerarquía

---

## 23. Filosofía del diseño

El isotipo tiene capas de lectura:

1. **Primera mirada** — 90
2. **Segunda mirada** — fútbol
3. **Tercera mirada** — gaming
4. **Cuarta mirada** — Noventeros FC Gamers

Ese descubrimiento progresivo es parte de la experiencia. No queremos explicar todo: queremos que
el usuario lo descubra.

> El fútbol se descubre. El gaming se descubre. El 90 se reconoce.

---

## 24. La marca en una frase

**Noventeros FC Gamers convierte la nostalgia de una generación en una nueva forma de competir juntos.**

El isotipo convierte esa idea en un símbolo: `90 — Fútbol × Gaming × Hermandad`.

---

## 25. Principio rector

Cuando una nueva aplicación del logo genere dudas, volver a esta pregunta:

> **¿Esto hace que el símbolo sea más reconocible, más elegante y más Noventero?**

Si la respuesta es no, el elemento sobra.

```
Menos elementos.
Más significado.
Un solo trazo.
Una sola identidad.
```
