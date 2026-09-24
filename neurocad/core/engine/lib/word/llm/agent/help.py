# neurocad/core/engine/lib/word/llm/agent/help.py

"""
Agent: help.

Answers questions about the NeuroCad editor only. Off-topic questions
are refused. Uses a small FAQ + rules block — no vector search yet.

No page modifications: returns html=None and selector=None.
"""

from typing import Any, Dict, Optional

from .base import CoreEngineLibWordLlmAgentBase


class CoreEngineLibWordLlmAgentHelp(CoreEngineLibWordLlmAgentBase):
    """Answer NeuroCad questions from a static FAQ + rules block."""

    name = "help"

    FAQ = """ДОКУМЕНТАЦИЯ NEUROCAD:

РЕДАКТОР
- Редактор построен на GrapesJS.
- Страница собирается из готовых блоков (core-hero, core-features,
  core-gallery, core-faq, core-cta, core-contacts, core-footer и др.).
- Каталог блоков отображается в левой панели, вкладка «Блоки».
- Перетащить блок на канвас можно мышкой.
- Сохранение страницы — автоматическое.

СТИЛИ
- Классы стилей заданы заранее. Свои классы создавать нельзя.
- Inline-стили (style="...") запрещены.
- Для уникальных визуальных эффектов используется <style> с
  уникальным префиксом, например effect-a3f7.
- Внутри <style> можно использовать var(--theme-*) для совместимости
  с темами.

ПРЕСЕТЫ
- Пресеты хранятся в левой панели, вкладка «Пресеты».
- Кнопка «+» сохраняет текущий канвас как новый пресет.
- Клик по пресету применяет его HTML и CSS к канвасу.
- Thumbnail загружается через POST /presets/{id}/thumbnail.

LLM-ЧАТ
- Чат открывается справа.
- Введите запрос — модель соберёт или изменит страницу.
- Кнопка «стоп» (■) отменяет текущий запрос.
- Кнопка «очистить чат» (иконка) удаляет историю сообщений.
- История сохраняется в БД и подгружается при открытии страницы.

ВЫДЕЛЕНИЕ ЭЛЕМЕНТА
- Команды «заполни выделенный блок» и «оформи фон выделенного»
  работают, если элемент выделен мышкой на канвасе.
- Выделить можно любой элемент — целый блок (<section>), либо
  внутренний узел (<div>, <h1>, <p>, <a>).
- Если ничего не выделено — появится сообщение
  «Выделите элемент на странице мышкой и повторите запрос».
- Выделить элемент можно кликом по нему на канвасе.

ВЕЖЛИВОСТЬ
- Приветствия («привет», «здравствуйте», «добрый день») — коротко
  поздоровайся и предложи помощь по редактору.
- Благодарности («спасибо», «благодарю», «спс», «thanks», «thank you»,
  «класс», «круто», «отлично», «супер») — ответь коротко и тепло:
  «Пожалуйста!», «Рад помочь!», «Обращайтесь!». Не отказывай.
- Прощания («пока», «до свидания», «bye») — коротко попрощайся:
  «До связи!», «Удачи!».
- Одобрение/реакция на результат («круто», «то что нужно», «получилось»)
  — порадуйся вместе с пользователем, коротко. Не отказывай.
- Если после вежливости пользователь хочет продолжить — предложи,
  с чем ещё помочь по редактору.

ЧЕГО НЕЛЬЗЯ ДЕЛАТЬ
- Писать в чате не по теме редактора — будет отказ. НО вежливость
  (приветствие, благодарность, прощание, реакция на результат) —
  это НЕ «не по теме», на неё всегда отвечай тепло и коротко.
- Использовать inline-стили.
- Создавать свои CSS-классы.
- Ломать структуру блоков вручную.

ПРАВИЛА ОТВЕТА:
1. Отвечай кратко (1–3 предложения).
2. Если ответа в документации нет — честно скажи:
   «В документации этого пока нет».
3. Если это вежливость — приветствие, благодарность, прощание,
   реакция на результат — ответь коротко и тепло (см. раздел
   ВЕЖЛИВОСТЬ). НЕ отказывай.
4. Если вопрос не про NeuroCad и это НЕ вежливость — вежливо
   откажись: «Я помогаю только с редактором NeuroCad. Спросите
   про блоки, пресеты, стили, чат или работу редактора».
5. Не придумывай функции, которых нет в документации.
6. Не предлагай пользователю вставлять SVG, <style> или inline-стили
   вручную — этим занимается агент effect.
7. Если пользователь спрашивает «как оформить фон выделенного» —
   ответь: «Выделите элемент мышкой и напишите „оформи фон
   выделенного“. Агент добавит эффект автоматически.»
"""

    async def run(
        self,
        *,
        provider,
        user_message: str,
        page_id: int,
        run_id: Any,
        emit=None,
        selection: Optional[Dict[str, Any]] = None,
        block_catalog: Optional[list] = None,
        current_html: Optional[str] = None,
        history: Optional[list] = None,
    ) -> Dict[str, Any]:

        # ---- emit: step at the start ----
        if emit:
            await emit({
                "type": "step",
                "step": "help",
                "message": "Ищу ответ...",
            })

        # ---- dump request ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_step(
                run_id=run_id,
                agent_name="help",
                system_prompt=self.FAQ,
                user_content=user_message,
                history=history,
            )
        except Exception as e:
            print(f"[help] dump request failed: {e}", flush=True)

        # ---- build messages ----
        messages = [{"role": "system", "content": self.FAQ}]
        if history:
            for m in history:
                role = m.get("role")
                content = m.get("content")
                if role in ("user", "assistant") and content:
                    messages.append({"role": role, "content": str(content)})
        messages.append({"role": "user", "content": user_message})

        # ---- provider call ----
        try:
            raw = await provider.generate_completion(messages)
        except Exception as e:
            print(f"[help] LLM error: {e}", flush=True)
            return {
                "message": "Не удалось получить ответ. Попробуйте ещё раз.",
                "html": None,
                "selector": None,
                "element_html": None,
            }

        # ---- dump response ----
        try:
            from ..dumper import CoreEngineLibWordLlmDumper
            CoreEngineLibWordLlmDumper.dump_response(
                run_id=run_id,
                agent_name="help",
                raw_response=raw,
            )
        except Exception as e:
            print(f"[help] dump response failed: {e}", flush=True)

        answer = (raw or "").strip()
        if not answer:
            answer = "В документации этого пока нет."

        return {
            "message": answer,
            "html": None,
            "selector": None,
            "element_html": None,
        }