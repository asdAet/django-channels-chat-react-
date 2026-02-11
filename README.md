# EchoChat

Чат на Django Channels + React (Vite).

## Возможности
- Публичный чат (гости читают, авторизованные пишут)
- Приватные комнаты по slug
- История сообщений и разделение по дням
- Онлайн: пользователи и гости (heartbeat + TTL)
- Профиль: аватар, "О себе", дата регистрации
- Переход в профиль по клику на аватар
- Rate-limit для авторизации и сообщений
- Админка Django

## Стек
- Backend: Django 4, Channels, Daphne
- Frontend: React + TypeScript, Vite
- Infra: Nginx, PostgreSQL, Redis, Docker Compose

## Запуск (локально)
Backend:
```bash
cd backend
python -m venv venv
venv\\Scripts\\activate
# Linux/macOS
# source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Vite проксирует `/api` и `/ws` на `http://localhost:8000`.

## Docker (production)
1) Создай `.env` из `example.env`
2) Запусти сборку:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## API
### REST
- `GET /api/auth/csrf/`
- `GET /api/auth/session/`
- `POST /api/auth/login/`
- `POST /api/auth/register/`
- `GET /api/auth/password-rules/`
- `GET/POST /api/auth/profile/`
- `GET /api/auth/users/<username>/`
- `GET /api/chat/public-room/`
- `GET /api/chat/rooms/<slug>/`
- `GET /api/chat/rooms/<slug>/messages/?limit=&before=`

### WebSocket
- `ws://<host>/ws/chat/<room>/`
- `ws://<host>/ws/presence/`

## Лицензия
Не указана.
