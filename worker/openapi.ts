export function openApi(origin: string) {
  const error = { description: 'Greška; ne tvrdi da je podatak sačuvan. Kod 401 traži novu prijavu, kod 409 razjasni konflikt.' };
  return {
    openapi: '3.1.0', info: { title: 'Naše finansije', version: '1.0.0', description: 'Zajednički kućni budžet u RSD. Dodavanje pojedinačne kupovine i čitanje mesečnog pregleda.' },
    servers: [{ url: origin }], security: [{ householdOAuth: ['budget'] }],
    components: { schemas: {}, securitySchemes: { householdOAuth: { type: 'oauth2', flows: { authorizationCode: {
      authorizationUrl: `${origin}/oauth/authorize`, tokenUrl: `${origin}/oauth/token`, scopes: { budget: 'Čitanje budžeta i dodavanje kupovina' },
    } } } } },
    paths: {
      '/api/summary': { get: {
        operationId: 'getBudgetSummary', summary: 'Pročitaj mesečni budžet, dnevne zbirove i poslednjih 20 kupovina.',
        description: 'Bez meseca vraća tekući mesec i današnji datum u Europe/Belgrade. Pozovi za tačan datum kada korisnik kaže danas ili juče. Za drugi mesec prosledi YYYY-MM.',
        parameters: [{ name: 'month', in: 'query', required: false, schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' } }],
        responses: { '200': { description: 'Mesečni pregled u dinarima, danas i vremenska zona.', content: { 'application/json': { schema: { type: 'object', properties: { today: { type: 'string' }, month: { type: 'string' }, totalSpent: { type: 'number' }, remainingBudget: { type: 'number' } }, additionalProperties: true } } } }, '401': error, '503': error },
      } },
      '/api/expenses': { post: {
        operationId: 'addExpense', summary: 'Dodaj jednu novu kupovinu u zajedničku evidenciju.',
        description: 'Dodaje na dnevni zbir, nikada ga ne zamenjuje. Generiši UUID requestId za novu kupovinu; za ponavljanje ISTE akcije posle greške koristi isti requestId i iste podatke.',
        'x-openai-isConsequential': true,
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', additionalProperties: false, required: ['requestId', 'date', 'amount', 'description'],
          properties: {
            requestId: { type: 'string', description: 'Jedinstven UUID. Sačuvaj isti pri ponavljanju zahteva.' },
            date: { type: 'string', format: 'date', description: 'Datum kupovine YYYY-MM-DD u Europe/Belgrade.' },
            amount: { type: 'number', minimum: 0, maximum: 100000000, description: 'Iznos u RSD sa najviše dve decimale. 1.450 dinara znači 1450.' },
            description: { type: 'string', maxLength: 160, description: 'Kratak opis koji je korisnik naveo, ili prazan tekst.' },
          },
        } } } },
        responses: { '201': { description: 'Sačuvana kupovina.' }, '200': { description: 'Zahtev je već obrađen; duplicate=true. Ako je deleted=true, kupovina je naknadno obrisana i nije ponovo dodata.' }, '400': error, '401': error, '409': error, '503': error },
      } },
    },
  };
}
