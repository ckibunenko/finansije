# Prečica na telefonu (iPhone)

Unos kupovine bez otvaranja aplikacije i bez prijave: jedan tap sa početnog ekrana, Action dugme,
ili glasom „Hej Siri, trošak“. Radi na besplatnom nalogu, bez ChatGPT-a i bez ikakve pretplate.

Adresa aplikacije: `https://nase-finansije.finansije-prodavnica.workers.dev`

## 1. Uzmite kod

U aplikaciji, na dnu strane, panel **„Prečica na telefonu“** → dugme **Napravi prečicu**. Kod se
prikazuje **samo jednom** — prepišite ga ili kopirajte odmah. Ako ga izgubite, napravite novi.

Kod je kao ključ od stana: ko ga ima, može da doda kupovinu i vidi mesečni pregled. Ne može da menja
plan, briše unose, izveze istoriju ni pokrene uvoz — server mu na sve to vraća 403. Ako telefon
nestane, kliknite **Opozovi prečice** u aplikaciji; svi kodovi prestaju da važe istog trena.

## 2. Napravite prečicu „Trošak“

Aplikacija **Prečice** (Shortcuts) → **+** → dodajte akcije ovim redom:

1. **Ask for Input** — Input type: **Number**, Prompt: `Koliko dinara?`
2. **Set Variable** — ime: `iznos`
3. **Ask for Input** — Input type: **Text**, Prompt: `Na šta?` (može se ostaviti prazno)
4. **Set Variable** — ime: `opis`
5. **URL** — zasebna akcija, u nju se kuca adresa:
   `https://nase-finansije.finansije-prodavnica.workers.dev/api/expenses`
6. **Get Contents of URL** — **URL polje ostavite prazno**
   - Adresa se ne kuca ovde. Sa praznim poljem ova akcija uzima izlaz prethodne, a to je akcija
     **URL** iz koraka 5, koja je pravog tipa. Ako se adresa kuca direktno u ovo polje, Prečice u
     njega ubace izlaz prethodne akcije i prečica pada sa „couldn't convert from Rich Text to URL“.
   - Method: **POST**
   - Headers: `Authorization` → `Bearer KOD` (umesto `KOD` nalepite kod iz odeljka 1 „Uzmite kod“;
     razmak između `Bearer` i koda je obavezan)
   - Request Body: **JSON**, dva polja:

     | Ključ | Tip | Value |
     |---|---|---|
     | `amount` | **Number** | promenljiva `iznos` |
     | `description` | Text | promenljiva `opis` |

     U polje Value ide **promenljiva**, ne otkucan tekst: tapnite polje pa je izaberite iz reda
     iznad tastature. Tip polja `amount` **mora** biti Number. Ako ostane Text, server odbija unos
     porukom o iznosu.
7. **Show Notification** — sadržaj: rezultat koraka 6

Koraci 2 i 4 postoje zato što Prečice imenuju promenljive po tipu akcije: bez njih se obe akcije
`Ask for Input` zovu **Provided Input**, pa se u listi ne razaznaje koja je koja.

Datum i identifikator zahteva **ne šalje telefon** — popunjava ih server. Datum je uvek današnji po
beogradskoj zoni, bez obzira na to kako je telefon podešen. Zato ovde nema ni `Date`, ni
`Format Date`, ni `Random Number`.

Ime prečice: **Trošak**. To je ujedno i fraza za Siri.

## 3. Postavite je nadohvat ruke

- **Podeli → Add to Home Screen** — ikonica pored ostalih aplikacija.
- **Podešavanja → Action Button → Shortcut → Trošak** (iPhone 15 Pro i noviji).
- **Podešavanja → Pristupačnost → Dodir → Back Tap** — dupli tap po poleđini telefona.
- Glasom: „Hej Siri, trošak“.

## 4. Provera

Unesite jednu kupovinu od 1 dinara sa opisom `test`, otvorite aplikaciju na webu i proverite da se
pojavila sa oznakom **„Uneto prečicom na telefonu“**, pa je obrišite dugmetom **Izmeni**.

## Šta prečica ne radi

Server pravi nov identifikator pri svakom pozivu, pa **dva pokretanja znače dva unosa**. Ako niste sigurni da
li je sačuvano, ne pokrećite ponovo — proverite u aplikaciji. To je isto ponašanje kao dvaput
pritisnuto dugme „Dodaj kupovinu“ na webu; zaštita od duplikata pokriva ponovljen *isti* zahtev, a
prečica pri svakom pokretanju šalje nov.

Kod važi 365 dana. Posle toga, i posle svake promene zajedničke šifre, napravite nov u aplikaciji.

## Dodatna prečica: „Koliko smo potrošili“

Ista stvar, samo kraće: **Get Contents of URL** sa metodom **GET** na
`.../api/summary`, isto `Authorization` zaglavlje, pa **Get Dictionary Value** za ključ `totalSpent`
i **Show Notification**.
