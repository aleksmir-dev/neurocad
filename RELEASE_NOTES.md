# neurocad 1.0.26

Release date: 2026-10-15

---

## English

- **Fix `use_botinv` delivery to the frontend.** The flag was missing from `GET /core/engine/lib/base/profile/` and `POST /core/auth/login` responses, so `BaseAuth.getUser()` never carried it and the "Инвентаризация" section stayed hidden for non-superadmin users even when the DB flag was set. Both endpoints now return `use_botinv`; `serialize_user` normalizes the value to a real boolean (`bool(user.use_botinv)` instead of `or False`, which leaked `1` as an int).

## Русский

- **Исправлена передача `use_botinv` на фронт.** Флаг не попадал в ответы `GET /core/engine/lib/base/profile/` и `POST /core/auth/login`, поэтому в объекте `BaseAuth.getUser()` его не было, и раздел «Инвентаризация» оставался скрытым для не-суперадминов, даже когда флаг в БД выставлен. Оба эндпоинта теперь отдают `use_botinv`; `serialize_user` нормализует значение до настоящего boolean (`bool(user.use_botinv)` вместо `or False`, который возвращал `1` как int).