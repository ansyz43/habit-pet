"""Одноразовая настройка бота под мини-апп: кнопка меню, описание, команды.

Запуск: python bot/setup_bot.py
Берёт BOT_TOKEN и WEBAPP_URL из bot/.env. Сам бот для этого запускать не нужно.
"""

import json
import pathlib
import urllib.request

ENV = pathlib.Path(__file__).with_name(".env")


def load_env() -> dict[str, str]:
    env = {}
    for line in ENV.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    return env


def call(token: str, method: str, **params) -> dict:
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        data = json.load(resp)
    print(f"{method}: {'ok' if data.get('ok') else data}")
    return data


def main() -> None:
    env = load_env()
    token, url = env["BOT_TOKEN"], env.get("WEBAPP_URL", "")
    if not url.startswith("https://"):
        raise SystemExit("Укажите WEBAPP_URL (https://…) в bot/.env")

    call(token, "setChatMenuButton", menu_button={
        "type": "web_app", "text": "Питомец", "web_app": {"url": url},
    })
    call(token, "setMyCommands", commands=[{"command": "start", "description": "Открыть питомца"}])
    call(token, "setMyShortDescription",
         short_description="Трекер привычек с питомцем: выполняй привычки — он растёт.")
    call(token, "setMyDescription", description=(
        "Выполняй полезные привычки — и твой питомец вылупится из яйца и вырастет до легенды. "
        "Забросишь привычки на несколько дней — он погибнет.\n\nНажми «Питомец» внизу, чтобы начать."
    ))


if __name__ == "__main__":
    main()
