"""Local setup helper: verify /start challenge without publishing credentials."""
import getpass
import secrets
from telegram_notify import api


def main():
    token = getpass.getpass('Токен BotFather (ввод скрыт): ').strip()
    bot = api(token, 'getMe', {})
    challenge = 'bkliz-' + secrets.token_hex(6)
    print(f"Откройте в Telegram @{bot['username']} и отправьте:")
    print('/start ' + challenge)
    input('После отправки нажмите Enter здесь: ')
    updates = api(token, 'getUpdates', {'limit': 100, 'timeout': 0, 'allowed_updates': ['message']})
    candidates = set()
    for update in updates:
        message = update.get('message', {})
        chat = message.get('chat', {})
        if message.get('text') == '/start ' + challenge and chat.get('type') == 'private':
            if message.get('from', {}).get('id') == chat.get('id'):
                candidates.add(chat['id'])
    if len(candidates) != 1:
        raise RuntimeError('Чат не подтверждён. Проверьте команду в своём личном чате с этим ботом и повторите запуск.')
    print('Сохраните это число в GitHub Secrets как TELEGRAM_CHAT_ID:')
    print(candidates.pop())


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error) if isinstance(error, RuntimeError) else 'Не удалось завершить настройку. Токен не выведен.')
        raise SystemExit(1)
