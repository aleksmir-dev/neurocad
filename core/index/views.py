# core/index/views.py

from django.http import JsonResponse

def index_content(request):
    text = """
    Добро пожаловать в систему управления.

    Этот дашборд предназначен для визуализации ключевых показателей,
    управления данными и оперативного принятия решений. Здесь вы можете
    настраивать отображение виджетов, изменять их расположение и получать
    доступ к актуальной информации в режиме реального времени.

    Система построена по модульному принципу. Каждый виджет представляет
    собой независимый компонент, который может быть подключён, обновлён
    или удалён без влияния на другие части приложения.

    Основные возможности:
    — Мониторинг финансовых операций
    — Управление пользователями
    — Аналитика и отчёты
    — Настройка интерфейса под себя

    Прокрутите этот текст вниз, чтобы проверить работу скролла внутри виджета.

    ----------------------------------------------------------------------

    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
    tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
    quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

    Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore
    eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident,
    sunt in culpa qui officia deserunt mollit anim id est laborum.

    ----------------------------------------------------------------------

    Ещё текст для прокрутки:

    1. Пункт один — описание возможностей системы и гибкости конфигурации.
    2. Пункт два — безопасность данных и разграничение прав доступа.
    3. Пункт три — масштабируемость и высокая производительность.
    4. Пункт четыре — удобный пользовательский интерфейс.
    5. Пункт пять — поддержка расширений и плагинов.

    ----------------------------------------------------------------------

    Повтор блока:

    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
    Lorem ipsum dolor sit amet, consectetur adipiscing elit.

    ----------------------------------------------------------------------

    Конец тестового текста. Если ты это читаешь — скролл работает 😄
    """

    return JsonResponse({'text': text})