# Besplatno objavljivanje

## Priprema naloga

Potreban je vaš Cloudflare nalog na **Workers Free** paketu. Koristi se besplatna `workers.dev` adresa i jedna D1 baza. Ne aktivirati Workers Paid, ne kupovati domen i ne dodavati plaćene usluge. Skripta za deploy sama ne pravi resurse, ne šalje tajne i ne menja paket.

1. Prijavite se na Cloudflare preko browsera. Ako pravite nalog, lično završite registraciju i uslove korišćenja.
2. U terminalu ovog projekta pokrenite `npx wrangler login` i odobrite pristup svom nalogu. Ne kopirajte pristupne tokene u razgovor.
3. Pokrenite `npx wrangler d1 create finansije`. Ako baza pod tim imenom već postoji, proverite da li pripada ovom projektu pre upotrebe; ne koristiti bazu igre.
4. Unesite dobijeni `database_id` u `wrangler.jsonc`, umesto nultog identifikatora. Ovo je identifikator resursa, nije lozinka.

## Šifra i prvi deploy

1. Lično pokrenite `npm run setup:secrets` u interaktivnom terminalu. Skripta generiše dugu nasumičnu zajedničku šifru od 32 znaka i prikaže je jednom u terminalu. Sačuvajte je u password manager-u; nemojte koristiti lokalnu test šifru.
2. Skripta pravi ignorisan `secrets.local.json` sa hešom šifre i nasumičnim OAuth client secret-om. Šifra nije sačuvana u fajlu. Koristi se nasumični ključ sa 192 bita entropije kako bi bezbedna provera ostala jeftina na Workers Free paketu. Ne zamenjivati ga kratkom ručno izabranom šifrom. Ovaj fajl ne dodavati u Git niti slati u chat.
3. Pokrenite `npm run deploy`. Skripta proverava D1 identifikator, gradi aplikaciju, primenjuje migracije i objavljuje Worker.
4. Pokrenite `npx wrangler secret bulk secrets.local.json` da postavite tajne. Do ovog koraka aplikacija je zatvorena za podatke jer nedostaje produkcioni heš šifre.
5. Otvorite dobijenu HTTPS adresu, prijavite se i najpre prenesite staru istoriju ako je imate. Lokalni test podaci se ne šalju automatski.
6. Dodajte adresu na početni ekran telefona preko browser menija. Pregled ostaje funkcionalan i bez GPT-ja.

Nijedna `VITE_*` promenljiva ne sme sadržati šifru, OAuth secret ili token baze. D1 se koristi preko serverskog binding-a; browser ne dobija pristup bazi.

## Prenos postojeće evidencije

U staroj aplikaciji, na istoj adresi i browseru gde su podaci, prvo napravite Export JSON i sačuvajte kopiju. Na novoj adresi izaberite Import JSON, pregledajte broj meseci/dana i zbir, pa potvrdite. Uvoz je dozvoljen samo dok je baza prazna. Ako je stara evidencija na istoj adresi i browseru, dugme za proveru starih podataka je može ponuditi direktno.

Svaki prethodni dnevni zbir postaje jedan zapis „Prenet dnevni zbir iz stare evidencije“. Ne izmišljaju se pojedinačne stare kupovine. Ponovljen identičan uvoz ne pravi duplikate. Uvoz u popunjenu bazu se odbija u celosti.

## Završna provera na live adresi

- Bez prijave `/api/state` i `/api/export` vraćaju 401; pogrešna šifra ne otvara podatke.
- Dva odvojena browsera sa zajedničkom šifrom vide iste podatke; probni unosi 1.500 i 700 daju zbir 2.200.
- Refresh, odjava/prijava i redeploy zadržavaju podatke.
- JSON izvoz sadrži ceo pregled i kupovine. Proveru vraćanja kopije raditi u zasebnoj lokalnoj ili praznoj test bazi, ne preko produkcionih podataka.
- Tek posle ovoga povezati GPT i testirati sa oba ChatGPT naloga po GPT_SETUP.md.

## Održavanje i oporavak

- Redovno preuzimajte JSON rezervnu kopiju (preporuka: mesečno i pre većih izmena). D1 Free trenutno ima sedmodnevni Time Travel; proverite aktuelne uslove. Povratak baze prvo isprobati u zasebnoj bazi, a ne prepisivati aktuelnu evidenciju bez pregleda.
- Dugme „Opozovi GPT pristup“ poništava sve GPT tokene i kodove za povezivanje. Sledeća upotreba zahteva novu prijavu.
- Promena `PASSWORD_HASH` poništava sve web i GPT sesije. Za namernu promenu sačuvajte prethodni lokalni secrets fajl na bezbedno mesto, generišite nove tajne i ažurirajte Cloudflare; ako promenite i OAuth client secret, ažurirajte ga i u GPT editoru.
- Dnevni Worker cron samo briše istekle sesije/kodove i privremene brojače pokušaja prijave. Ne briše troškove i ne pravi nove pretplate.
- Brisanje kupovine u aplikaciji je soft-delete. Zapis ostaje radi sprečavanja ponavljanja starog zahteva. Export sadrži aktivne kupovine. Trajno uklanjanje podataka zahteva zasebnu svesnu administrativnu operaciju i proveru rezervnih kopija.
- Greška baze ili dostignut Free limit vraća 503/grešku; korisnik treba da zadrži nacrt i ponovi zahtev. Ne zatvarati stranicu dok postoji nepotvrđen unos.
- Izmene plana i kupovina koriste verzije. Kod konflikta učitajte novo stanje i ponovo donesite odluku; ne prepisujte tuđe izmene automatski.

## Izvori

- [Workers Free limiti](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 cene i limiti](https://developers.cloudflare.com/d1/platform/pricing/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
