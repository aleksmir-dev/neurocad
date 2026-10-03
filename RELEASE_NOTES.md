# neurocad 1.0.3

Release date: 2026-10-03

---

## English

### Added

- **Real certificate issuance check.** The "Certificate issued" message now means the certificate is actually issued and valid, not just that the Caddy server is reachable. The backend performs a real TLS handshake to the domain (`ssl.create_default_context` + `socket.create_connection`) and verifies the certificate chain and hostname before reporting success.
- **Clickable links in domain cards.** Both the free subdomain (`<login>.neurocad.ru`) and the custom second-level domain are shown as full clickable URLs (`https://...`) that open in a new tab.
- **"Copy" button.** Next to every domain link there is a "Copy" button that copies the **full URL** (`https://testuser1.neurocad.ru`) to the clipboard, ready to paste into the address bar.

### Changed

- **`_ask_caddy` in the domain service.** Replaced the no-op stub with a real TLS probe. First attempt with a 30-second timeout (triggers On-Demand TLS issuance), then a retry with a 5-second timeout (the certificate is already issued and cached by then). All attempts are logged.
- **Error messages for certificate issuance.** Instead of a fake "Certificate issued", the UI now shows a specific reason: timeout, connection refused, DNS not resolving, or an SSL verification error.
- **Domain links in UI.** Domains are now displayed as full URLs with `https://`, not as bare hostnames. This matches what users actually paste into the browser.

### Fixed

- **Fake "Certificate issued" message.** Previously the message was shown as soon as the Caddy admin API responded, even if the certificate was never issued. Now it is only shown after a successful TLS handshake confirms the certificate is valid for the domain.
- **Copy button payload.** The "Copy" button now copies the full URL (`https://atou.ru`) instead of the bare hostname (`atou.ru`), so the user can paste it directly into the address bar.

---

## Русский

### Добавлено

- **Реальная проверка выпуска сертификата.** Сообщение «Сертификат выпущен» теперь означает, что сертификат действительно выпущен и валиден, а не просто что сервер Caddy доступен. Бэкенд выполняет реальный TLS-handshake к домену (`ssl.create_default_context` + `socket.create_connection`) и проверяет цепочку сертификатов и имя хоста, прежде чем сообщить об успехе.
- **Кликабельные ссылки в карточках доменов.** И бесплатный поддомен (`<login>.neurocad.ru`), и кастомный домен второго уровня показываются как полные кликабельные URL (`https://...`), которые открываются в новой вкладке.
- **Кнопка «Копировать».** Рядом с каждой ссылкой на домен есть кнопка «Копировать», которая копирует **полный URL** (`https://testuser1.neurocad.ru`) в буфер обмена — можно сразу вставить в адресную строку.

### Изменено

- **`_ask_caddy` в сервисе доменов.** Заглушка заменена на реальную TLS-проверку. Первая попытка с таймаутом 30 секунд (запускает выпуск сертификата через On-Demand TLS), затем повторная попытка с таймаутом 5 секунд (к этому моменту сертификат уже выпущен и закеширован). Все попытки логируются.
- **Сообщения об ошибках при выпуске сертификата.** Вместо фиктивного «Сертификат выпущен» UI показывает конкретную причину: таймаут, отказ в соединении, DNS не резолвится или ошибка SSL-проверки.
- **Ссылки на домены в UI.** Домены теперь отображаются как полные URL с `https://`, а не как голые хосты. Это соответствует тому, что пользователь реально вставляет в браузер.

### Исправлено

- **Фиктивное сообщение «Сертификат выпущен».** Раньше сообщение показывалось сразу после ответа admin API Caddy, даже если сертификат не был выпущен. Теперь оно показывается только после успешного TLS-handshake, подтверждающего, что сертификат валиден для этого домена.
- **Содержимое кнопки «Копировать».** Кнопка «Копировать» теперь копирует полный URL (`https://atou.ru`), а не голый хост (`atou.ru`) — пользователь может сразу вставить его в адресную строку.

---

## Файлы, затронутые в 1.0.3

### Backend

- `neurocad/core/engine/lib/base/profile/domain/service.py` — `_ask_caddy` переписан: реальная TLS-проверка с ретраем; новый метод `_tls_probe`; добавлены импорты `ssl`, `asyncio`; константы `TLS_PROBE_FIRST_TIMEOUT = 30.0`, `TLS_PROBE_RETRY_TIMEOUT = 5.0`.

### Frontend

- `neurocad/core/engine/lib/base/profile/domain/domain.js` — новый хелпер `_fullUrl(host)`; кликабельные ссылки в карточках поддомена, кастомного домена и в блоке «Готово»; единый обработчик `copy-link`; копирование полного URL.
- `neurocad/core/engine/lib/base/profile/domain/domain.css` — новые классы `.domain-link-row` и `.domain-link`.

### Проверено, без изменений

- `neurocad/core/engine/lib/base/profile/domain/schema.py` — контракт не менялся.
- `neurocad/core/engine/lib/base/profile/domain/route.py` — контракт не менялся.
- `neurocad/core/engine/lib/base/profile/domain/checked.py` — не требует синхронизации.
- `neurocad/utils/routes.py` — уже правили в 1.0.2.

---

## Как проверить

```bash
curl -sL -o /dev/null -w 'final: %{url_effective}\ncode: %{http_code}\n' https://atou.ru/