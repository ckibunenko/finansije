# Finansije prodavnica

Aplikacija za pracenje mesecnog budzeta prodavnice. Omogucava unos dnevnih troskova,
pracenje planiranog budzeta, cilj stednje, grafikone potrosnje i import/export
podataka kroz JSON fajl.

## Preduslovi

Pre pokretanja proverite da imate instalirano:

- Git
- Node.js 20 ili noviji
- npm

Provera verzija:

```bash
node -v
npm -v
git --version
```

Ako Node nije instaliran, preporuka je Node.js 20 LTS ili novija verzija.

## Preuzimanje projekta

Klonirajte repo:

```bash
git clone https://github.com/ckibunenko/finansije.git
```

Udjite u folder projekta:

```bash
cd finansije
```

## Instalacija

Instalirajte dependency-je:

```bash
npm install
```

Ako zelite instalaciju tacno po `package-lock.json` fajlu, koristite:

```bash
npm ci
```

`npm ci` je dobar izbor za cistu instalaciju ili CI/CD okruzenje.

## Pokretanje u development modu

Pokrenite lokalni dev server:

```bash
npm run dev
```

Terminal ce ispisati lokalni URL. Najcesce je:

```text
http://localhost:5173/
```

Otvorite taj URL u browseru.

## Kako se koristi aplikacija

1. Izaberite mesec preko polja za mesec ili dugmadi `Prethodni mesec` i `Sledeci mesec`.
2. Unesite `Planirani mesecni budzet`.
3. Po zelji unesite `Mesecni cilj za stednju`.
4. Izaberite datum unosa.
5. U polje `Dnevni trosak` unesite iznos za taj dan.
6. Kliknite `Sacuvaj unos`.

Primeri dnevnog unosa:

```text
5400
```

postavlja ukupni trosak za izabrani dan na 5400 RSD.

```text
+1400
```

dodaje 1400 RSD na vec postojeci trosak za izabrani dan.

Ako ostavite polje za dnevni trosak prazno i kliknete `Sacuvaj unos`, unos za taj
dan se brise.

## Podaci

Podaci se cuvaju lokalno u browseru, u `localStorage`. To znaci:

- podaci ostaju sacuvani u istom browseru na istom racunaru
- podaci se ne salju na server
- drugi browser ili drugi racunar nece automatski imati iste podatke

Za prenos podataka koristite:

- `Export JSON` za preuzimanje backup fajla
- `Import JSON` za ucitavanje ranije izvezenog fajla

## Production build

Za proveru production build-a:

```bash
npm run build
```

Ako build prodje, lokalno ga mozete pregledati komandom:

```bash
npm run preview
```

Terminal ce ispisati URL za pregled build-a.

## Najcesci problemi

Ako `npm install` ili `npm run dev` ne radi, prvo proverite Node verziju:

```bash
node -v
```

Koristite Node 20 ili noviji.

Ako port `5173` nije slobodan, Vite ce ponuditi drugi port. U tom slucaju otvorite
URL koji terminal ispise.

Ako zelite potpuno novu instalaciju dependency-ja, obrisite lokalni `node_modules`
folder i pokrenite:

```bash
npm install
```
