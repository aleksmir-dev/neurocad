# RELEASE-NOTES.md

## neurocad 1.0.29

Release date: 2026-10-16

---

### English

- **Backup fixes.** Per-instance cron isolation from `APP_DOMAIN` / `APP_HOST` / `APP_PORT` / `APP_SYSTEM_USER`, `{"level": "..."}` body in the generated cron line, `rclone` resolved via `shutil.which()` with an explicit `PATH`/`HOME` env and a `/usr/bin/rclone` fallback, `/backup/s3/test` always answering 200 with `{"success": false, "message": "..."}`, S3 credentials stripped of whitespace and quotes, and a new `neurocad install` CLI writing systemd + nginx from `neurocad/etc/*.conf` templates shipped inside the wheel.

### Русский

- **Исправления бэкапов.** Изоляция cron по инстансам из `APP_DOMAIN` / `APP_HOST` / `APP_PORT` / `APP_SYSTEM_USER`, тело `{"level": "..."}` в сгенерированной cron-строке, `rclone` через `shutil.which()` с явными `PATH`/`HOME` и фолбэком на `/usr/bin/rclone`, `/backup/s3/test` всегда отвечает 200 с `{"success": false, "message": "..."}`, ключи S3 очищаются от пробелов и кавычек, а новая CLI-команда `neurocad install` пишет systemd + nginx из шаблонов `neurocad/etc/*.conf` внутри wheel.