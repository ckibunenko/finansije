# Objavljena aplikacija

Adresa: https://nase-finansije.finansije-prodavnica.workers.dev

Cloudflare Worker: `nase-finansije`. D1 baza: `finansije`. Hosting koristi `workers.dev` adresu; nije kupljen domen niti aktiviran plaćeni paket.

8. septembra 2026. u Cloudflare panelu potvrđen je **Free — Current plan, $0**. Online uvoz je završen: januar–septembar 2026, 9 mesečnih planova i 133 dnevna zapisa, ukupno 334.101,64 RSD. Svi datumi, iznosi, budžeti i ciljevi štednje upoređeni su sa originalnim JSON fajlom. Proverena kopija je u ignorisanom direktorijumu `.wrangler/backups`.

Provere na objavljenoj adresi: API bez prijave vraća 401, prijava i odjava rade na desktopu i mobilnom prikazu, sesija opstaje nakon osvežavanja, a šema Actions koristi ispravnu HTTPS adresu. Testovi nisu dodavali finansijske zapise u produkciju.

Zajednička šifra je na ovom računaru u ignorisanom fajlu `.env.access.txt`. Sačuvajte je u password manager-u i podelite sa suprugom. Fajl nije deo objavljene aplikacije. `secrets.local.json` sadrži serverski heš i OAuth client secret i takođe je izuzet iz Git-a.

Podaci se na online adresi čuvaju u D1 bazi. Lokalna baza je odvojena: lokalni unosi posle prenosa neće se automatski pojaviti online. Za svakodnevno korišćenje otvorite online adresu.

GPT „Naše finansije“ je 8. septembra 2026. sačuvan sa deljenjem „Only me“ i **povezivanje radi** — u logu se vidi
ceo tok: `GET /oauth/authorize` 200, `POST /oauth/authorize` 303, `POST /oauth/token` 200, pa `GET /api/summary` 200.

Njegov stvarni callback je `https://chat.openai.com/aip/g-1ba2c4f7f03c93d928da418c602a273f65fcd8bf/oauth/callback`.
Do njega su vodila tri različita identifikatora: adresa editora nacrta je pokazivala `g-6aa0323ca76c819181e60de5149ce797`,
Actions ekran `g-ea3795ad542728286ba5e1fa41555efe2655ecad`, a ChatGPT je stvarno slao treći. **Allowlist se postavlja
prema `redirect_uri` iz `npx wrangler tail`, nikako prema onome što editor prikazuje.** Obe varijante domena su upisane
u `OAUTH_REDIRECT_URIS`.

Pri podešavanju je Client Secret bio nalepljen u polje Client ID; u tom panelu Client ID je maskiran tačkama, pa je
broj tačaka jedini znak. `nase-finansije` je 14 znakova, secret 64.

Cloudflare prihvata OAuth callback za taj GPT (chatgpt.com i chat.openai.com varijante). 8. septembra 2026. `npm run check:oauth` je prošao ceo OAuth tok na objavljenoj adresi, onako kako ga ChatGPT izvodi: svih 16 provera prošlo, uključujući čitanje septembarskog pregleda i potvrdu da GPT token dobija 403 na izvoz i pun snimak stanja. Serverska strana je time potvrđena, a provera je ponovljena i sa stvarnim callback-om sačuvanog GPT-ja. Veze koje su testovi napravili brišu se dugmetom „Opozovi GPT pristup“.

Prava prijava iz browsera otkrila je tri bag-a koje nijedan dotadašnji test nije mogao da uhvati, jer i `fetch` i Miniflare zaobilaze ono što browser stvarno primenjuje:

1. **`Origin: null` na formi.** `secure()` je postavljao `Referrer-Policy: no-referrer` na sve odgovore, a po Fetch specifikaciji browser pod tom politikom šalje `Origin: null` i pri slanju forme sa istog domena. `sameOrigin()` je vraćao 403. Rešeno funkcijom `formOrigin()` (naveden Origin mora da se poklapa, izostavljen se prihvata jer CSRF kolačić `SameSite=Lax` ionako ne stiže cross-site) i politikom `same-origin` na stranici za potvrdu.
2. **CSP je blokirao slanje forme.** `form-action 'self'` važi i za odredište redirecta, a forma završava na ChatGPT callback-u. Klik nije radio ništa. Stranica za potvrdu sada šalje `form-action 'self' https://chatgpt.com https://chat.openai.com`; ostale rute su ostale strogo na `'self'`.
3. **`/privacy` je bio beskonačna petlja.** Worker je prepisivao `/privacy` u `/privacy.html`, a asset server vraća `/privacy.html` nazad na `/privacy`. Rešeno tako što worker više ne prepisuje putanju.

Regresioni testovi za prva dva su u `tests/worker.test.ts`; treći se proverava sa `curl -I /privacy` (očekuje se 200, ne 307).

U GPT editoru 8. septembra 2026. prozor Share GPT nudi samo „Only me“ uz poruku „Sharing GPTs with the public is no longer available.“ Deljenje jednog GPT-ja supruzi preko linka time otpada, ali deljenje ni nije potrebno: podaci su zajednički zato što je baza zajednička. Rešenje je po jedan GPT na svakom nalogu, oba prema istom API-ju, uz dodavanje njenog callback URL-a u `OAUTH_REDIRECT_URIS`. Cena je drugi plaćeni ChatGPT nalog, jer pravljenje custom GPT-ja traži plaćeni paket. Web aplikacija ostaje zajednička i potpuno funkcionalna u svakom slučaju. Pri čuvanju je otkrivena i duplirana Actions konfiguracija za isti domen; potrebno je ostaviti samo jednu sa obe operacije.

Detaljna uputstva su u `GPT_SETUP.md`. U editoru uvezite:

`https://nase-finansije.finansije-prodavnica.workers.dev/openapi.json`

Authorization URL: `https://nase-finansije.finansije-prodavnica.workers.dev/oauth/authorize`

Token URL: `https://nase-finansije.finansije-prodavnica.workers.dev/oauth/token`

Privacy URL: `https://nase-finansije.finansije-prodavnica.workers.dev/privacy`

Client ID: `nase-finansije`. Scope: `budget`. Client secret kopirajte iz `secrets.local.json` direktno u GPT editor, bez slanja u razgovor. Tačan callback URL dobijen u GPT editoru mora se dodatno postaviti kao Cloudflare secret `OAUTH_REDIRECT_URIS`.

Za naredne objave: `npm run deploy`. Migracije se primenjuju bez resetovanja baze. Redovno koristite Export JSON za rezervnu kopiju.
