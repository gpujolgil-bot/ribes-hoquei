# Ribes Club Patí

Web del **Ribes Club Patí** (hoquei patins, Sant Pere de Ribes, des de 1989).

- `index.html`: web del club (història, equips, resultats del cap de setmana, estadístiques i inscripcions).
- `resultats/`: classificacions, jornades, previsions i simulador de cada equip.
- `img/`: escut, fotos i vídeo del club.

- **Dades:** es llegeixen de [hoquei.info](https://hoquei.info/) amb `scripts/update.py`.
- **Actualització automàtica:** `.github/workflows/actualitzar.yml` (cada 20 min els caps de setmana, diumenge a mitjanit i 3 cops al dia entre setmana) desa `data/*.json` i republica la web a GitHub Pages.
- **Equips:** es configuren a `teams.json` (URL del grup a hoquei.info i nom exacte de l'equip del Ribes).
- **Model:** `model.js` (rating de Massey regularitzat i simulació Montecarlo, en un Web Worker).

Per afegir un equip nou: afegeix una entrada a `teams.json` i executa l'acció "Actualitzar resultats i publicar" des de la pestanya *Actions*.
