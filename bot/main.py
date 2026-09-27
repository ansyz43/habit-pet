"""Бот-спутник мини-аппа: отвечает на /start кнопкой «Открыть питомца».

Запуск: pip install -r bot/requirements.txt && python bot/main.py
Позже сюда добавятся напоминания (для них нужен сервер, который знает прогресс).
"""

import asyncio
import pathlib

from aiogram import Bot, Dispatcher
from aiogram.filters import CommandStart
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

ENV = pathlib.Path(__file__).with_name(".env")
env = dict(
    line.split("=", 1)
    for line in ENV.read_text(encoding="utf-8").splitlines()
    if "=" in line and not line.startswith("#")
)
TOKEN = env["BOT_TOKEN"].strip()
WEBAPP_URL = env["WEBAPP_URL"].strip()

dp = Dispatcher()


@dp.message(CommandStart())
async def start(message: Message) -> None:
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="🥚 Открыть питомца", web_app=WebAppInfo(url=WEBAPP_URL)),
    ]])
    await message.answer(
        "Привет! Здесь живёт твой питомец. Выполняй привычки — он вылупится и вырастет.\n"
        "Не забывай про него: без отметок несколько дней подряд он погибнет.",
        reply_markup=kb,
    )


async def main() -> None:
    await dp.start_polling(Bot(TOKEN))


if __name__ == "__main__":
    asyncio.run(main())
