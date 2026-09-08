# Russian accuracy review — round 1 of 2

Model editorial review, not a human translator's certification. Reviewed the complete UTF-8 `ru-translation-draft.json` against its Korean keys, with the existing App.jsx and Admin.jsx as context. This round checks semantic accuracy, Russian grammar, and naturalness; reading difficulty is assessed separately.

## Corrections recommended

| Korean key | Current Russian | Suggested Russian | Reason |
| --- | --- | --- | --- |
| 작은 기록에서 둘 다 찾아요. | Записывай и радуйся успехам. | В маленьких записях найди и счастье, и удачу. | Semantic omission: `둘 다` refers to happiness and luck in the two preceding clover lines. The draft replaces these with success. The suggestion preserves both referents. |
| 관리자 서버에 연결하지 못했어요. | Нет связи с экраном учителя. Попробуйте снова. | Не удалось подключиться. Попробуйте снова. | Semantic imprecision: a screen is not the server being connected to. Omitting the technical server noun keeps the actual connection failure accurate and understandable. The message appears in the teacher context. |

## Optional naturalness improvements, not translation errors

| Korean key | Current Russian | Suggested Russian | Reason |
| --- | --- | --- | --- |
| 오늘의 용돈 기록하러 가기 | Записать деньги за сегодня | Записать, сколько денег пришло и ушло сегодня | `Записать деньги` is understandable but less natural than recording an amount or money movement. The expanded suggestion is precise; a shorter button label may be preferable after layout review. |
| 내용은 1~80자로 적어 주세요. | Напиши от 1 до 80 знаков о своей записи. | Напиши, о чём запись: от 1 до 80 знаков. | The first version sounds like writing about the record itself. The suggested wording more clearly asks for the record description while preserving both limits. |
| 통계 월 선택 | Выбрать месяц итогов | Выбрать месяц | The original is understandable, but `месяц итогов` is a stiff noun combination. The context already supplies the statistics purpose. |

## Checks passed

- `Пришло` and `Ушло` retain incoming and outgoing money without restricting them to purchases or wages. Their short forms are appropriate in money tables.
- `Осталось`, `Сейчас осталось`, the end-of-day explanation, and the all-records explanation preserve cumulative balances. `Пришло минус ушло за месяц` correctly describes monthly net change, which can be negative and is not the cumulative balance.
- The administrator footnote correctly distinguishes sums for the selected period from the balance calculated from all records. Existing Admin.jsx confirms that behavior.
- `{count}` phrases avoid Russian number-dependent noun endings. `{name}`, `{description}`, and `{month}` placeholders are preserved in the catalog. Personal names do not require declension in `Привет, {name}!`, `Дневник денег: {name}`, or `Все записи: {name}`.
- All monthly `за {month}` phrases require the accusative month name. For Russian month nouns, its form is identical to the standalone nominative: `за январь`, `за сентябрь`, `за май`. A full date uses a genitive month, such as `8 сентября`; implementation must format those separately.
- Password messages consistently require four **digits**, preserve current/new/repeated password distinctions, and preserve the distinction between waiting up to 15 minutes and trying again after 15 minutes.
- The deletion warning preserves irreversible deletion and balance recalculation.
- The currency remains Korean won: `₩`, `корейских вонах`, and numeric limits in won. No conversion to rubles is suggested.
- Record access is described as limited to the student and teacher, with the separate teacher password and device continuity preserved.
- Description length limits 60 and 80, money limits 100,000,000 and 999,999,999, and year limits 1900–2100 are individually preserved exactly; their differing application contexts are implementation concerns, not translation mistakes.

Round 1 result: two accuracy corrections recommended; three optional naturalness improvements. The rest is suitable to proceed to a second accuracy pass after revisions. No claim of native-speaker or human certification is made.
