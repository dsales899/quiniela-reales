# Quiniela Reales

Web privada per als vuit amics. Funciona amb el pla gratuït de Firebase (Spark): sense targeta i sense pauses per inactivitat.

## Publicar-la

Necessites [Node.js](https://nodejs.org) al teu ordinador.

1. A [console.firebase.google.com](https://console.firebase.google.com), crea un projecte nou amb el pla Spark.
2. A **Authentication > Sign-in method**, activa **Email/Password**.
3. A **Firestore Database**, crea la base de dades en mode de producció (ubicació a Europa).
4. A **Configuració del projecte > Les teues apps**, afegeix una app web i copia els valors a `public/firebase-config.js`.
5. Obri un terminal dins d'aquesta carpeta i executa:

   ```
   npm run setup
   npx firebase-tools login
   npx firebase-tools use --add
   npm run deploy
   ```

   Quan acabe, et donarà l'enllaç `https://…web.app` per compartir al grup.

`npm run setup` crea `invitacions.txt` amb un codi per persona. No el compartisques sencer ni el pugis a GitHub: envia a cada amic només el seu codi, per privat.

## Primer ús

1. Cada amic obri l'enllaç, toca el seu nom, «Primer cop? Tinc un codi d'invitació», escriu el codi i tria un PIN de 4 xifres.
2. Denis i Enric tenen la pestanya **Jornades**, amb les jornades fetes i les tres següents.
3. Toca **J20 + Afegeix partits**, tria Lliga, Europa o Copa i posa l'hora límit. Toca cada casella **+ Equip** i tria l'escut (o enganxa la llista de WhatsApp). Toca **Publica la jornada**: queda oberta i activa per a tothom.
4. Cada amic omple la seua columna i toca **Dono l'OK**. A partir d'aquí ja no la pot canviar. Si s'ha equivocat, Denis o Enric la desbloquegen a Jornades > Columnes i pagaments, on també marquen qui ha pagat.

Si algú oblida el PIN: Jornades > Comptes > Reinicia PIN. Torna a entrar amb el seu codi i tria'n un de nou. Els seus pronòstics es conserven.

## Comprovar les regles de seguretat

Abans d'obrir-la al grup, amb Java instal·lat:

```
npm install
npm run test:rules
```

Després fes la prova final amb dos mòbils: dos amics desant alhora, intent de canvi passat el termini i canvi de jornada activa.

## Dades diàries dels equips

Classificació i ratxa (últims 5 partits) de Primera, Segona, Champions, Europa League, Conference i Liga F, i els últims 5 enfrontaments entre dos equips (de les tres últimes temporades). També es baixen els resultats de les lligues d'Anglaterra, Itàlia, Alemanya, França, Portugal, Països Baixos, Bèlgica, Turquia i Escòcia perquè els equips europeus tinguin forma. Tot gratuït i sense cap clau.

- Font: l'API pública d'ESPN. No és oficial ni té garantia: si un dia canvia, aquella competició mostra «Dades no disponibles» i es conserven les dades del dia anterior.
- S'actualitza un cop al dia, a primera hora, amb GitHub Actions (gratuït).

1. Puja aquesta carpeta a un repositori de GitHub (sense `invitacions.txt`).
2. A **Actions > Dades diàries**, toca **Run workflow** un cop per comprovar que surten les sis competicions. Si alguna dona error, revisa'n el codi a `scripts/sync-stats.mjs`.
3. Si el repositori és públic, posa a `public/firebase-config.js` com a `statsUrl`:
   `https://raw.githubusercontent.com/USUARI/REPOSITORI/main/public/data/stats.json`
   Si és privat, deixa `data/stats.json` i torna a publicar l'app quan vulguis (`npm run deploy`).

## Límits del pla gratuït

- Firestore: 1 GiB, 50.000 lectures i 20.000 escriptures al dia.
- Hosting: 10 GB i 360 MB de transferència al dia.
- Si s'esgota una quota, el servei s'atura fins que es reinicia. No es cobra res.
- Per exportar dades: botó «Exporta CSV» a cada jornada.

Escuts: [FootyLogos.com](https://www.footylogos.com). Les marques són dels seus propietaris.
