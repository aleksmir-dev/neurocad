Окончательный список файлов для компонента nav
text
1. app/core/engine/lib/nav/component.js          # логика компонента
2. app/core/engine/mod/assistent/assistent.json  # главный конфиг (сборка)
3. app/core/engine/mod/assistent/header/header.json    # конфиг блока навигации
4. app/core/engine/core.js                       # фабрика (загрузка компонентов через LoadJS)
5. app/core/engine/renderer.js                   # рендеринг компонентов
6. app/core/engine/engine.html                   # подключение LoadJS
📁 Структура
text
app/core/engine/
├── lib/
│   └── nav/
│       └── component.js
├── mod/
│   └── assistent/
│       ├── assistent.json
│       └── nav/
│           └── nav.json
├── core.js
├── renderer.js
├── binder.js
├── api.js
├── route.py
└── engine.html
Содержание файлов:

assistent.json
json
{
  "module": "assistent",
  "blocks": [
    { "$ref": "nav/nav.json" }
  ]
}
nav/nav.json
json
{
  "component": "nav",
  "path": "nav",
  "props": {
    "showHeader": true
  }
}