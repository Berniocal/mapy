# Slepé mapy Evropy a Asie

Statická aplikace pro procvičování a prohlížení zeměpisných pojmů. Otevři web přes HTTP (například `python3 -m http.server`). Nevyžaduje sestavení ani API klíč.

- Automatické rozložení podle šířky okna; ruční přepnutí Telefon / Počítač se pamatuje v prohlížeči.
- Tmavý vzhled GeoLabu podle původní Work verze. Počítač má trvalý boční panel, telefon sbalovací panel s vlastním posouváním.
- Při prohlížení lze kdykoli zaškrtnout celé okruhy i jednotlivé pojmy. Jen vybrané pojmy se zvýrazňují a reagují na kliknutí; změny se projeví okamžitě. Vyhledávání je dostupné pod výběrem okruhů.
- Bodové značky měst mají při kliknutí přednost před řekou a státem pod nimi. Při přechodu do testu se výukové zvýraznění odstraní.
- Státy a moře se hodnotí podle oblastí, řeky a pohoří podle průběhu, malé objekty používají toleranci. Vlastní pojmy mají uživatelský bod a poloměr.
- Přiblížení do 32×, ovládání myší i dotykem, historie odpovědí, výběr jednotlivých pojmů, import/export vlastních pojmů.

## Kontrola

`node --check app.js`, `node tests/geometry.cjs` a `node tests/learning.cjs`.

Regresní kontrola pokrývá orientaci polygonů, rozlišení pevniny a vody, moře, stát a řeku. Při úpravě rozložení ověř také úzké okno, otočení telefonu a dlouhý název otázky. Velikost mapy sleduje ResizeObserver, včetně změn výšky hlavičky po odpovědi.

## Zdroje

Knihovny a podklady jsou uložené přímo v repozitáři, aby načtení nezáviselo na CDN. Mapové soubory mají i záložní síťové zdroje.

- D3 7.9.0, ISC: https://github.com/d3/d3 (licence `vendor/d3-LICENSE`).
- topojson-client 3.1.0, ISC: https://github.com/topojson/topojson-client (licence `vendor/topojson-client-LICENSE`).
- world-atlas 2.0.2, `countries-10m.json`: https://github.com/topojson/world-atlas. Mapová data Natural Earth jsou public domain; zpracování world-atlas je ISC.
- Natural Earth, `ne_50m_geography_marine_polys.geojson`: https://github.com/nvkelso/natural-earth-vector. Mapová data jsou public domain: https://www.naturalearthdata.com/about/terms-of-use/.

Před výpočty se sjednocuje orientace polygonů pro D3. Některé malé ostrovní polygony v podkladu jsou orientované opačně; bez normalizace může jediný polygon překrýt celou mapu a zneplatnit test vody.
