# neurocad 1.0.1

Release date: 2026-10-02

---

## English

### Added

- **Automatic certificate cleanup for disconnected domains.** When a client disconnects their domain, its certificate is physically removed from Caddy after 30 days. If the client returns within a month, the deletion is cancelled.
- **Protected system domains.** `neurocad.ru`, `neurocad-dev.ru`, `neurocad-demo.ru` and all their subdomains are never deleted automatically, even if someone tries to disconnect them.
- **Second-level domain support.** You can now connect `example.com`, not just `www.example.com`.

### Changed

- Cleanup runs lazily — on superadmin visit to the admin panel. No cron, no background workers.

### Fixed

- The domain connection form no longer rejects second-level domains.

---

## Русский

### Добавлено

- **Автоматическая очистка сертификатов отключённых доменов.** Когда клиент отключает свой домен, через 30 дней его сертификат физически удаляется из Caddy. Если клиент вернётся в течение месяца — удаление отменяется.
- **Защита системных доменов.** `neurocad.ru`, `neurocad-dev.ru`, `neurocad-demo.ru` и все их поддомены никогда не удаляются автоматически, даже если кто-то попытается их отключить.
- **Поддержка доменов второго уровня.** Теперь можно подключать `example.com`, а не только `www.example.com`.

### Изменено

- Очистка запускается лениво — при заходе супер-админа в админку. Никаких cron и фоновых процессов.

### Исправлено

- Форма подключения домена больше не отклоняет домены второго уровня.