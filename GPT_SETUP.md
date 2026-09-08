# Povezivanje GPT-ja „Naše finansije“

## Zašto po jedan GPT za svakog od vas

OpenAI je ukinuo deljenje GPT-jeva linkom; editor 8. septembra 2026. nudi samo „Only me“ uz poruku
„Sharing GPTs with the public is no longer available.“ **Deljenje GPT-ja nije ni potrebno.** Podaci
su zajednički zato što je baza zajednička, a ne zato što je GPT zajednički. Svaki GPT je samo klijent
koji zove ovaj API.

Zato: vi napravite svoj GPT na svom nalogu, supruga svoj na svom. Isti `openapi.json`, isti Client ID
i secret, ista zajednička šifra pri povezivanju. Razgovori su odvojeni, podaci zajednički.

Jedina stvarna prepreka je pretplata: pravljenje custom GPT-ja traži plaćeni ChatGPT paket, pa je za
drugi GPT potreban i drugi plaćeni nalog. Ako to nije opcija, web aplikacija ostaje zajednička i
potpuno funkcionalna za oboje.

Ovo povezivanje ne poziva OpenAI model API i ne zahteva OpenAI API ključ — ChatGPT poziva API vaše
aplikacije.

## Stanje servera: provereno

8. septembra 2026. `npm run check:oauth` je prošao ceo OAuth tok na objavljenoj adresi, tačno onako
kako ga ChatGPT izvodi. Svih 16 provera je prošlo: stranica za potvrdu, CSRF kolačić, odbijanje
pogrešne šifre, kod na ChatGPT callback, nepromenjen `state`, razmena koda za token, odbijanje
iskorišćenog koda, odbijanje pogrešnog client secreta, čitanje mesečnog pregleda, zabrana izvoza i
punog snimka stanja GPT tokenu, obnavljanje tokena preko HTTP Basic autentikacije, rotacija refresh
tokena i odbijanje starog refresh tokena.

Serverska strana, dakle, nije više nepoznata. Ostaje samo podešavanje u ChatGPT editoru.

Skripta se pokreće ponovo bilo kada:

```
npm run check:oauth                      # objavljena adresa
npm run check:oauth http://127.0.0.1:8787   # lokalni worker
```

Ne upisuje troškove i ne ispisuje šifru, client secret ni tokene. Napravi jednu GPT vezu, koju posle
obrišete dugmetom „Opozovi GPT pristup“ u aplikaciji.

## Prvi GPT (vaš)

1. Otvorite GPT editor. Naziv: **Naše finansije**. Opis: „Zajednički budžet, pregled potrošnje i brz
   unos kupovina u dinarima.“
2. U Instructions nalepite sadržaj `GPT_INSTRUCTIONS.md`. U Knowledge **ne dodajte** rezervne kopije
   finansija, šifre ni secrets fajl.
3. Actions → Import from URL:
   `https://nase-finansije.finansije-prodavnica.workers.dev/openapi.json`
   **Ostavite samo jednu Actions konfiguraciju za ovaj domen.** U nacrtu je 8. septembra zatečena
   duplirana; obrišite višak tako da ostane jedna sa obe operacije (`getBudgetSummary`, `addExpense`).
4. Authentication → OAuth. Client ID `nase-finansije`; Client Secret je `OAUTH_CLIENT_SECRET` iz
   `secrets.local.json` (kopirajte lično, bez slanja u razgovor).
5. Authorization URL: `.../oauth/authorize`; Token URL: `.../oauth/token`; Scope: `budget`. Token
   exchange je standardni POST; server prihvata client credentials u telu ili u HTTP Basic zaglavlju.
   PKCE se namerno odbija — nemojte ga uključivati.
6. Privacy policy URL: `.../privacy`. Izaberite model koji podržava Actions.
7. **Callback URL pročitajte iz logova, ne iz editora.** Ovo je 8. septembra 2026. odnelo najviše vremena:
   adresa editora je pokazivala `g-6aa0323ca76c819181e60de5149ce797`, Actions ekran je prikazivao
   `g-ea3795ad542728286ba5e1fa41555efe2655ecad`, a ChatGPT je stvarno slao treći —
   `g-1ba2c4f7f03c93d928da418c602a273f65fcd8bf`. Jedini pouzdan izvor je sam zahtev. Pokrenite

   ```
   npx wrangler tail --format json
   ```

   pa u ChatGPT-ju kliknite „Sign in with Naše finansije“ i iz zabeleženog `GET /oauth/authorize`
   pročitajte `redirect_uri`. Taj identifikator upišite u allowlist. Wildcard nije dozvoljen.
   Log sadrži zaglavlja zahteva, pa ga obrišite kad završite.
8. Sačuvajte GPT sa deljenjem „Only me“ i pitajte ga „Koliko smo potrošili ovog meseca?“ da završite
   OAuth prijavu zajedničkom šifrom.

## Drugi GPT (supruginin)

Isti koraci 1–8 na njenom nalogu, sa istim Client ID-jem i secretom. Njen GPT ima **svoj** `g-`
identifikator, pa i svoj callback URL. Dodajte ga pored postojećih, razdvojeno zarezima:

```
npx wrangler secret put OAUTH_REDIRECT_URIS
```

pa unesite sve dozvoljene adrese u jednom redu:

```
https://chatgpt.com/aip/g-VAŠ/oauth/callback,https://chat.openai.com/aip/g-VAŠ/oauth/callback,https://chatgpt.com/aip/g-NJEN/oauth/callback,https://chat.openai.com/aip/g-NJEN/oauth/callback
```

Lista se čita u `worker/auth.ts` (`OAUTH_REDIRECT_URIS.split(',')`), pa broj GPT-jeva nije ograničen.
Dozvoljene su samo tačne HTTPS adrese oblika `https://chatgpt.com/aip/g-.../oauth/callback` ili
`https://chat.openai.com/aip/g-.../oauth/callback`.

Ne zaboravite da isto ažurirate i `secrets.local.json`, da lokalna kopija ostane tačna.

## Završni test sa oba naloga

- Na prvom nalogu pitajte „Koliko smo potrošili ovog meseca?“ i uporedite odgovor sa aplikacijom.
- Unesite jednu jasno označenu test kupovinu; ChatGPT traži potvrdu upisa jer je akcija označena
  `x-openai-isConsequential: true`.
- Na drugom nalogu proverite da isti pregled uključuje tu kupovinu, pa unesite drugu test kupovinu i
  proverite zbir na webu.
- Pitajte za „juče“ oko prelaska meseca i proverite konkretan datum pre potvrde.
- Test kupovine obrišite u aplikaciji.
- Kliknite „Opozovi GPT pristup“ i proverite da oba GPT naloga ponovo traže prijavu, pa ih povežite.

## Važne granice

- Actions potvrda je deo predviđenog toka; upis bez potvrde ChatGPT-ja se ne obećava.
- `requestId` štiti ponovljeni isti pokušaj. Dve nezavisne poruke u različitim razgovorima sa novim
  `requestId`-jevima su dva unosa; pouzdanog semantičkog prepoznavanja iste kupovine nema.
- Kolona `source` beleži samo `gpt`, pa se iz baze ne vidi ko je od vas dvoje uneo kupovinu.
- Svako ko zna zajedničku šifru ima pristup istom prostoru. Nema javne registracije drugih domaćinstava.
- Šifra ostaje samo u formi za prijavu; u browser i GPT se ne šalje D1 token. Access token traje sat
  vremena, rotirajući refresh token najduže 90 dana. Posle toga se korisnik ponovo prijavljuje.
- GPT token ne može da menja plan, izveze istoriju, uveze rezervnu kopiju, izmeni ni obriše kupovinu —
  server mu na sve to vraća 403.

[GPT Actions](https://developers.openai.com/api/docs/actions/introduction) · [OAuth](https://developers.openai.com/api/docs/actions/authentication) · [Potvrde upisa](https://developers.openai.com/api/docs/actions/production)
