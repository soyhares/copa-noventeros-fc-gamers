#!/bin/bash
# Genera los iconos que sirve la app a partir de las fuentes de marca.
#
# No corre en el despliegue: se ejecuta a mano cuando cambia el arte y el
# resultado se commitea. Usa sips, que viene con macOS -- el proyecto no tiene
# gestor de paquetes ni build (ver CLAUDE.md).
#
#   bash tools/iconos.sh
set -euo pipefail
cd "$(dirname "$0")/.."

CARBON=070907        # --bg del libro de marca, para el relleno del maskable
ISO=assets/brand/isotipo.png
APP=assets/brand/app-icon.png
HERO=assets/brand/hero-neon.png
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

chico(){ sips -s format png -z "$1" "$1" "$2" --out "$3" >/dev/null 2>&1; }

# Favicon (§13): sale del app-icon, no del isotipo suelto. El isotipo transparente
# tiene trazos finos con contorno negro que a 32 px se empastan; sobre el fondo
# oscuro del app-icon el 90 se sigue leyendo. Adaptación óptica, no alteración.
#
# ponytail: ninguna de las dos fuentes es la versión "micro" que pide §13 (sin los
# símbolos de gaming). Cuando exista ese arte, cambiar la fuente de estas dos
# líneas y volver a correr el script.
chico 32 "$APP" assets/favicon-32.png
chico 16 "$APP" assets/favicon-16.png

# El isotipo que sirve la app (topbar 34px, hero 150px) -- 256 cubre @2x.
chico 256 "$ISO" assets/logo.png

# Iconos de instalación (§12): el app-icon, que ya trae fondo propio.
chico 180 "$APP" assets/apple-touch-icon.png
chico 192 "$APP" assets/icon-192.png
chico 512 "$APP" assets/icon-512.png

# Maskable: Android recorta hasta un 20% por lado, así que el arte se mete en un
# lienzo 25% más grande relleno de carbón -- la zona de seguridad de §19.
sips -s format png --padToHeightWidth 1568 1568 --padColor "$CARBON" "$APP" --out "$TMP/pad.png" >/dev/null 2>&1
chico 512 "$TMP/pad.png" assets/icon-maskable-512.png

# Vista previa al compartir el link: 1200x630 recortado del hero. En JPEG
# porque es una imagen fotográfica: en PNG pesa 800 KB y en JPEG unos 90 KB.
sips -s format png -Z 1200 "$HERO" --out "$TMP/og.png" >/dev/null 2>&1
sips -c 630 1200 "$TMP/og.png" --out "$TMP/og-crop.png" >/dev/null 2>&1
sips -s format jpeg -s formatOptions 78 "$TMP/og-crop.png" --out assets/og.jpg >/dev/null 2>&1

echo "Listo:"; ls -lh assets/*.png assets/og.jpg | awk '{print "  "$9"  "$5}'
