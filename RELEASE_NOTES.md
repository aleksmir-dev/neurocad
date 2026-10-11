# neurocad 1.0.19

Release date: 2026-10-11

---

## English

The article catalog is now managed by the **"Administrator" agent** (former Router) — it always asks a clarifying question before picking an agent, even when it is 100% sure.

**Copy** and **Move** buttons were added to the toolbar: Copy works on any selection, Move works on exactly one item and prevents folder cycles.

**Public visibility** of a page or folder can now be toggled from the edit form with a new "Публиковать" checkbox. Templates are no longer listed in the public catalog.

**create_page** now runs its own clarifying dialog before generating — one question at a time, per genre, and stops on any "вперёд". The dialog prompt was reworked so the agent asks about colours, effects, block count and other details instead of jumping straight to generation. A fallback was added so a bare-text question from the model is still treated as a question.

Page render was extracted into a separate `card.js`, and a new generic list-picker modal (`BaseModalList`) was added.

## Русский

Каталог статей теперь управляется **агентом «Администратор»** (бывший «Роутер») — он всегда задаёт уточняющий вопрос перед выбором агента, даже когда уверен на 100%.

В тулбар добавлены кнопки **«Копировать»** и **«Переместить»**: копирование работает на любом выделении, перемещение — ровно на одной карточке, с защитой от циклов в папках.

Публичность страницы или папки теперь переключается прямо из формы редактирования — новым чекбоксом **«Публиковать»**. Шаблоны больше не показываются в публичном каталоге.

**create_page** теперь ведёт собственный диалог уточнений перед генерацией — по одному вопросу за раз, по жанру, и останавливается на любом «вперёд». Промпт диалога переработан: агент спрашивает про цвета, эффекты, количество блоков и другие детали, а не бросается сразу генерировать. Добавлен fallback — если модель вернула вопрос простым текстом, он всё равно распознаётся как вопрос.

