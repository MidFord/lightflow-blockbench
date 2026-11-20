# Bedrock Wiki: referencia local de Terrain Renderer

Fuente: [Bedrock Wiki, Bedrock-OSS](https://github.com/Bedrock-OSS/bedrock-wiki), revisión
`ca2fb9af5415ebbb993c0b6c1b26e2b37e386b34`, consultada el 2026-11-03.

La copia consultable está en
`output/references/bedrock-wiki-snapshot/ca2fb9af5415ebbb993c0b6c1b26e2b37e386b34/reader/index.html`.
Abre ese HTML directamente: tiene búsqueda de páginas y tablas renderizadas, sin servidor,
instalar la web ni ejecutar ejemplos. El índice Markdown `INDEX.md` junto a `snapshot.json`
permite buscar las fuentes con `rg`. Son 317 archivos Markdown/JSON y 281 páginas HTML;
no incluye ilustraciones, assets del juego, el submódulo de ejemplos ni el runtime VitePress.
Los otros componentes específicos de VitePress se conservan como texto fuente.

La copia es una referencia de desarrollo local ignorada por Git. Para reproducirla:

```powershell
python scripts/snapshot_bedrock_wiki.py
python scripts/build_bedrock_wiki_reader.py
python scripts/build_bedrock_block_catalog.py
```

El lector requiere `markdown-it-py`. El primer comando consulta el commit fijado, guarda por
commit y valida cada archivo contra el blob Git de origen; reanuda descargas verificadas.
Para descargar una referencia más reciente: `python scripts/snapshot_bedrock_wiki.py --revision wiki`.
El catálogo y lector usan la revisión fijada en `build_bedrock_block_catalog.py`: una nueva
revisión descargada no actualiza las reglas de producción automáticamente.

## Qué se aprovecha en el plugin

`bedrock_block_catalog.js` contiene datos derivados de seis tablas, con hashes SHA-256 de
las fuentes y las versiones documentadas. No editarlo: se genera con el script anterior.

| Fuente | Aplicación |
| --- | --- |
| `blocks/vanilla-block-tags` | 1056 bloques con tags exactos, consultables con `hasTag` y `tagsFor` |
| `items/vanilla-item-tags` | 802 ítems con tags; separados de los tags de bloques |
| `items/vanilla-item-groups` | 1391 ítems con categoría y grupo vanilla, consultables con `itemInfo` |
| `blocks/block-states`, `block-permutations` | Esquema de estados, defaults y permutations ordenadas del diccionario JS |
| `blocks/block-traits` | Traits de colocación cardinal, seis direcciones, cara y mitad vertical |
| `blocks/block-components#placement-filter` | Condiciones alternativas por cara y bloque/tag/estados del soporte |
| `items/item-catalog`, `blocks/blocks-as-items` | Metadatos del inventario, identificador del ítem, grupo, nombre y búsqueda |
| `blocks/block-models`, `block-shapes`, `block-culling`, `block-tinting`, `flipbook-textures` | Referencias para editar modelos/apariencia sin sustituir los resolvers de packs existentes |

Los tags documentan **Preview 1.26.70.21**; los grupos, **Preview 1.26.30.29**. No se promete
que un cliente estable anterior tenga todos esos bloques/tags. Las tablas son consultas:
no se añaden herramientas, alimentos ni entidades al inventario de bloques colocables.
Los grupos vanilla no sustituyen las pestañas de trabajo actuales de Terrain; cada regla
puede elegir explícitamente una pestaña con `inventory.category`.

## Alcance y límites

La wiki documenta Add-Ons; no es una implementación completa del motor Minecraft ni un
catálogo exhaustivo de geometría/texturas vanilla. Las familias `lightflow:*` son ayudas
del editor y se distinguen de los tags exactos del juego. Ningún tag de herramienta o
ítem se interpreta automáticamente como tag de bloque.

El diccionario usa condiciones JS (`when.states`, `match.tag` o callbacks), no ejecuta
Molang de la wiki. Los filtros se comprueban al colocar sobre el soporte golpeado; no
simulan supervivencia posterior, destrucción del soporte, drops, loot, redstone, ticking,
scripts, conexiones de traits nuevos, multi-blocks ni física de Minecraft. Un clic en el
plano virtual no tiene bloque de soporte y falla si la regla exige uno. Los modelos y
texturas personalizados siguen resolviéndose con las rutas ya existentes de Terrain.

## Atribución

Datos adaptados de Bedrock Wiki contributors; las páginas fuente identifican también a
sus colaboradores (incluido QuazChick en las tres referencias de tablas). Las páginas
declaran `license: true`; el componente upstream `License.vue` lo traduce a **CC BY 4.0**
para texto/imágenes y **MIT** para ejemplos de código. Se normalizaron los IDs, tags y
grupos de las tablas a JavaScript, conservando revisión, enlaces y hashes. No se copian
ejemplos de código en el runtime. [Licencia CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
y [texto local](../../licenses/bedrock-wiki-CC-BY-4.0.md).

Páginas de origen: [tags de bloques](https://wiki.bedrock.dev/blocks/vanilla-block-tags),
[tags de ítems](https://wiki.bedrock.dev/items/vanilla-item-tags),
[grupos](https://wiki.bedrock.dev/items/vanilla-item-groups).
