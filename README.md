# Magic TCG Catalogo

Catalogo React para vender cartas de Magic: The Gathering a amigos. Las cartas se editan en `public/catalog.json`.

## Editar cartas

Cada carta usa este formato:

```json
{
  "id": "sol-ring-cmm",
  "name": "Sol Ring",
  "set": "CMM",
  "type": "Artifact",
  "foil": false,
  "price": 3.5,
  "quantity": 1,
  "imageUrl": ""
}
```

- `name`: nombre de la carta.
- `set`: codigo del set, por ejemplo `CMM`, `LTR` o `CLU`.
- `type`: tipo de carta, por ejemplo `Artifact`, `Instant`, `Sorcery`, `Creature`, `Land` o `Enchantment`.
- `foil`: `true` si es foil, `false` si no lo es.
- `price`: precio en colones costarricenses.
- `quantity`: cantidad disponible para vender.
- `imageUrl`: opcional. Si lo dejas vacio, la pagina intenta buscar la imagen en `https://api.magicthegathering.io/v1/cards` usando `name` y `set`.

Tambien puedes agregar campos opcionales como `setName`, `condition` o `sold`.

## Desarrollo

```bash
npm install
npm run dev
```

## Optimizar imagenes

Si dejas `imageUrl` vacio, la pagina busca la imagen en el API al abrir el sitio. Eso es comodo, pero con muchas cartas se vuelve lento.

Para resolver las imagenes una sola vez y guardarlas en `public/catalog.json`, corre:

```bash
npm run hydrate:images
```

Despues de eso, el sitio carga las imagenes directamente desde las URLs guardadas y ya no necesita consultar el API por cada carta.

## Build

```bash
npm run build
```

El sitio queda en `dist/`.

## GitHub Pages

El proyecto usa `base: "./"` en `vite.config.ts`, asi que funciona como GitHub Pages de proyecto, por ejemplo:

```text
https://tu-usuario.github.io/Magic_TCG/
```

Puedes publicar `dist/` con GitHub Actions o con la configuracion de Pages de tu repositorio.
