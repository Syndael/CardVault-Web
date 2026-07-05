#!/bin/bash

set -e

# Origen
SOURCE="/home/syndael/Escritorio/Todo/Programacion/CardVault_v2/CardVault-Web"

# Destinos
PRO_DEST="/mnt/sda1/ProgramacionNas/CardVault/CardVault-Web"
DEMO_DEST="/mnt/sda1/ProgramacionNas/CardVault/CardVault-Web_demo"

echo "========================================="
echo " Publicando CardVault-Web"
echo "========================================="

copy_site() {
    local DEST="$1"

    echo
    echo "-> Copiando a: $DEST"

    # Sustituir la carpeta static completa
    rm -rf "$DEST/static"
    cp -r "$SOURCE/static" "$DEST/"

    # Copiar index.html
    cp "$SOURCE/index.html" "$DEST/"

    echo "   ✔ Archivos copiados"
}

# Copiar archivos comunes
copy_site "$PRO_DEST"
copy_site "$DEMO_DEST"

# Configuración PRO
cp -f \
    "$SOURCE/config-pro.js" \
    "$PRO_DEST/static/js/api-config.js"

echo "   ✔ Configuración PRO aplicada"

# Configuración DEMO
cp -f \
    "$SOURCE/config-demo.js" \
    "$DEMO_DEST/static/js/api-config.js"

echo "   ✔ Configuración DEMO aplicada"

echo
echo "========================================="
echo " Publicación finalizada correctamente."
echo "========================================="
