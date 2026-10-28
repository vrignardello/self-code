# Self Code

Un editor de escritorio para experimentar con JavaScript y TypeScript. Construido con Electron, Monaco y TypeScript, con archivos reales y ejecución separada de la interfaz.


## Instalar
Ejecutar
```
npm run build
npx --yes @electron/packager . "Self Code" \
  --platform=darwin \
  --out=release \
  --overwrite \
  --ignore='^/(analysis|artifacts|tests|release|[.][^/]+)(/|$)'
```

Instalar desde /release