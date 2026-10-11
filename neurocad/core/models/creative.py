# neurocad/core/models/creative.py

"""
Creative — рекламный креатив.

Один креатив может быть размещён на нескольких страницах —
см. Placement. У креатива есть erid — токен ОРД, который
нужен для отчётности.

Поля для генерации блока «Креатив» на странице
------------------------------------------------
Блок «Креатив» (ReadyBlocks, id=core-creative) — это готовая
рекламная вставка на странице. Он собирается автоматически из
полей этого креатива:

    text         — основной текст рекламы
                   («Ищете хостинг для размещения…?»);
    button_text  — текст кнопки-ссылки
                   («Посмотрите здесь»);
    target_url   — куда ведёт ссылка;
    brand        — наименование рекламодателя
                   («ООО «Бегет»») — обязательно по закону;
    inn          — ИНН рекламодателя («7801451618») —
                   обязательно по закону;
    erid         — токен ОРД («2VtzqxQSRkE») — обязательно
                   по закону о рекламе.

Все поля опциональны: старые креативы без текстов/бренда/ИНН
продолжают работать. Если поле пустое — соответствующий кусок
в блоке не выводится (кроме target_url, он может быть "#").
"""

from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Index
from datetime import datetime as dt
from typing import Optional
from .base import Base


class Creative(Base):
    __tablename__ = "creatives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    nav_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("nav.id"),
        nullable=False,
    )

    # ---- Основное ----
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    erid: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    target_url: Mapped[Optional[str]] = mapped_column(String(2048))
    media_file: Mapped[Optional[str]] = mapped_column(Text)

    # ---- Контент блока «Креатив» ----
    # Основной рекламный текст. Показывается в блоке как абзац
    # над кнопкой. Опционально — старые креативы могут быть без
    # текста, блок тогда покажет только кнопку и юр. строку.
    text: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    # Текст кнопки-ссылки. 64 символа — с запасом: реальные
    # рекламные CTA редко длиннее 30 символов.
    button_text: Mapped[Optional[str]] = mapped_column(
        String(64),
        nullable=True,
    )

    # ---- Юридические реквизиты ----
    # Наименование рекламодателя. Свободный текст — может быть
    # «ООО «Бегет»», «ИП Иванов И.И.», «АО Ромашка» и т.п.
    brand: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    # ИНН рекламодателя. Храним строкой (не int): ведущие нули
    # допустимы теоретически, и по ИНН никогда не считают
    # арифметику. 32 символа — с запасом (стандартный ИНН РФ —
    # 10 или 12 цифр).
    inn: Mapped[Optional[str]] = mapped_column(
        String(32),
        nullable=True,
    )

    # ---- Служебное ----
    is_active: Mapped[int] = mapped_column(Integer, default=1)
    is_delete: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[dt] = mapped_column(DateTime, default=dt.now)
    updated_at: Mapped[dt] = mapped_column(
        DateTime, default=dt.now, onupdate=dt.now
    )

    __table_args__ = (
        Index('idx_creatives_nav_id', 'nav_id'),
        Index('idx_creatives_erid', 'erid'),
        Index('idx_creatives_is_delete', 'is_delete'),
    )