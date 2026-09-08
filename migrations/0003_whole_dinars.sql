-- Money moves from integer paras to whole dinars. Existing rows are divided by 100 and
-- rounded to the nearest dinar, so a day total can shift by up to one dinar per purchase.
UPDATE months SET budget = CAST(ROUND(budget / 100.0) AS INTEGER),
                  savings = CAST(ROUND(savings / 100.0) AS INTEGER);
UPDATE expenses SET amount = CAST(ROUND(amount / 100.0) AS INTEGER);
-- Retry detection compares the stored payload with the retried request, so the payload has to
-- be restated in dinars too. Imported rows carry the literal 'import' instead of JSON.
UPDATE expenses SET original_payload = json_set(original_payload, '$.amount', amount)
  WHERE json_valid(original_payload) AND json_type(original_payload, '$.amount') IS NOT NULL;
