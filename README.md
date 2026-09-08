# Naše finansije

Privatna zajednička evidencija troškova za jedno domaćinstvo. Postojeći React pregled, grafikoni i svetla/tamna tema ostaju; podaci se čuvaju na serveru u Cloudflare D1 bazi. GPT Actions koristi isti API i bazu, bez OpenAI API ključa.

## Šta je promenjeno

- Zajednička šifra, serverske sesije od 30 dana i odjava. Šifra se ne ugrađuje u JavaScript.
- Svaki unos dodaje **jednu kupovinu**. Dnevni zbir se računa iz kupovina. `+1400` i `1400` oba dodaju 1.400 dinara; izmena postojećeg iznosa radi se preko „Izmeni“.
- Prazno polje ne briše podatke. Nula označava dan bez potrošnje, a dan bez unosa ostaje prazan.
- Server sabira novac u parama. Istovremene kupovine se ne prepisuju. Isti `requestId` ne može dva puta upisati kupovinu.
- Izmene kupovina i mesečnog plana proveravaju verziju i prijavljuju konflikt ako je drugi uređaj u međuvremenu menjao podatke.
- Pregled se osvežava na 20 sekundi dok je stranica vidljiva, po povratku u aplikaciju i dugmetom Osveži. Nacrti ostaju pri neuspelom čuvanju dok je stranica otvorena.
- Uvoz stare evidencije ili nove rezervne kopije ide preko pregleda i potvrde **samo u praznu bazu**. Nema automatskog spajanja ili prepisivanja. Stari localStorage ostaje netaknut.
- Izvoz JSON sadrži pojedinačne kupovine i mesečne podatke (format `finansije-v2`). Stari format je podržan za uvoz.
- GPT može da čita mesečni pregled i dodaje kupovine; ne može da menja plan, briše, izvozi sve podatke ili pokrene uvoz. Web dugme opoziva sve GPT pristupe.

## Lokalno pokretanje

Potrebni su Node.js 22.18+ (ili noviji podržan LTS) i npm. Produkcioni hosting ne koristi lokalni disk ovog računara.

```powershell
npm ci
npm run setup:local
npm run db:local
npm run build
npm run preview
```

Otvorite `http://127.0.0.1:8787`. Test šifra koju postavlja `setup:local` je `lokalna-provera-finansije-123456` i namenjena je **isključivo lokalnoj proveri**. Skripta neće prepisati postojeći `.dev.vars`. Lokalna baza je u ignorisanom `.wrangler/state` direktorijumu.

Za razvoj sa osvežavanjem koda pokrenite `npm run dev:api`, a u drugom terminalu `npm run dev`. Vite prosleđuje API pozive lokalnom Worker-u.

## Provere

```powershell
npm test
npm run build
npm run test:browser
```

API testovi koriste stvarni Cloudflare Workerd/Miniflare i lokalni D1, sa praznom privremenom bazom. Browser testovi koriste instalirani Google Chrome u headless režimu i sopstvenu privremenu bazu; ne koriste vaše podatke ni naloge. Snimci su u `.wrangler/screenshots`.

Scenariji pokrivaju dva uređaja, novčane iznose i datume, duplirane zahteve, konflikte izmena, uvoz i izvoz, OAuth razmenu i rotaciju tokena, opoziv pristupa, CSRF, ograničavanje pokušaja prijave i izgubljen odgovor posle uspešnog upisa. Browser test obuhvata mobilni prikaz, tamnu temu i uvoz bez brisanja starog localStorage-a.

## Objavljivanje i ChatGPT

Pratite [DEPLOYMENT.md](DEPLOYMENT.md). Za GPT konfiguraciju upotrebite [GPT_SETUP.md](GPT_SETUP.md) i [GPT_INSTRUCTIONS.md](GPT_INSTRUCTIONS.md).

Cloudflare Workers Free + D1 Free su ciljna konfiguracija. Nema plaćenog AI API-ja, plaćenog domena, R2, niti automatskog prelaska na plaćeni plan. Besplatni limiti i ponuda provajdera mogu se menjati; pre objave proveriti stanje naloga. Ako se limit dostigne, UI treba da prikaže grešku, a ne lažnu potvrdu čuvanja.

Ovo je jedan zajednički prostor sa jednom šifrom. Oznaka „web/GPT“ opisuje izvor unosa, ne identitet osobe. Prava imena, dva odvojena naloga, čuvanje računa/fotografija i automatski offline red nisu uključeni. Podaci se ne keširaju u service worker-u.
