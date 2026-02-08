import { useEffect, useMemo, useRef, useState } from 'react';
import { getPublicRoom, getRoomDetails, getRoomMessages } from '../shared/api/chat';
import type { RoomDetails } from '../entities/room/types';
import type { UserProfile } from '../entities/user/types';
import { debugLog } from '../shared/lib/debug';
import type { Message } from '../entities/message/types';
import type { OnlineUser } from '../shared/api/users';

type Props = {
  user: UserProfile | null;
  onNavigate: (path: string) => void;
};

export function HomePage({ user, onNavigate }: Props) {
  const [publicRoom, setPublicRoom] = useState<RoomDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveMessages, setLiveMessages] = useState<Message[]>([]);
  const [online, setOnline] = useState<OnlineUser[]>([]);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const presenceRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    queueMicrotask(() => setLoading(true));
    let active = true;
    getPublicRoom()
      .then((room) => {
        if (active) setPublicRoom(room);
      })
      .catch(() => {
        debugLog('Public room fetch failed');
        if (active) setPublicRoom(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const visiblePublicRoom = useMemo(() => publicRoom, [publicRoom]);
  const isLoading = useMemo(() => loading, [loading]);

  useEffect(() => {
    let active = true;

    if (!visiblePublicRoom) {
      queueMicrotask(() => {
        if (active) setLiveMessages([]);
      });
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      return () => {
        active = false;
      };
    }

    const roomSlug = visiblePublicRoom.slug;
    getRoomMessages(roomSlug)
      .then((payload) => {
        if (!active) return;
        // показываем последние 4 сообщения
        setLiveMessages(payload.messages.slice(-4));
      })
      .catch((err) => debugLog('Live feed history failed', err));

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${scheme}://${window.location.host}/ws/chat/${encodeURIComponent(
        roomSlug
      )}/`
    );
    socketRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.message && active) {
          setLiveMessages((prev) => {
            const next = [
              ...prev,
              {
                id: Number(new Date()),
                username: data.username,
                content: data.message,
                profilePic: data.profile_pic || null,
                createdAt: new Date().toISOString(),
              },
            ];
            return next.slice(-4);
          });
        }
      } catch (error) {
        debugLog('Live feed WS parse failed', error);
      }
    };
    socket.onerror = (err) => debugLog('Live feed WS error', err);
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
    };

    return () => {
      active = false;
      socket.close();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [user, visiblePublicRoom]);

  useEffect(() => {
    let active = true;
    if (!user) {
      queueMicrotask(() => setOnline([]));
      if (presenceRef.current) {
        presenceRef.current.close();
        presenceRef.current = null;
      }
      return () => {
        active = false;
      };
    }

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(
      `${scheme}://${window.location.host}/ws/presence/`
    );
    presenceRef.current = socket;

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (active && data.online) {
          setOnline(data.online);
        }
      } catch (err) {
        debugLog('Presence WS parse failed', err);
      }
    };
    socket.onerror = (err) => debugLog('Presence WS error', err);
    socket.onclose = () => {
      if (presenceRef.current === socket) {
        presenceRef.current = null;
      }
    };

    return () => {
      active = false;
      socket.close();
      if (presenceRef.current === socket) {
        presenceRef.current = null;
      }
    };
  }, [user]);

  const createRoomSlug = (length = 8) => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const values = new Uint8Array(length);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(values);
      return Array.from(values, (value) => alphabet[value % alphabet.length]).join('');
    }
    let fallback = '';
    for (let i = 0; i < length; i += 1) {
      fallback += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return fallback;
  };

  const onCreateRoom = async () => {
    if (!user || creatingRoom) return;
    setCreateError(null);
    setCreatingRoom(true);
    let navigated = false;

    try {
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const slug = createRoomSlug();
        const details = await getRoomDetails(slug);
        if (details.created === false) {
          continue;
        }
        navigated = true;
        onNavigate(`/rooms/${encodeURIComponent(slug)}`);
        return;
      }
      setCreateError('Не удалось создать уникальную комнату. Попробуйте еще раз.');
    } catch (err) {
      debugLog('Room create failed', err);
      setCreateError('Не удалось создать комнату. Попробуйте еще раз.');
    } finally {
      if (!navigated) {
        setCreatingRoom(false);
      }
    }
  };

  return (
    <div className="stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Django Channels + React</p>
          <h1>Чат в реальном времени.</h1>
          <p className="lead"></p>
          <div className="actions">
            <button
              className="btn primary"
              onClick={() => onNavigate('/rooms/public')}
            >
              Открыть публичный чат
            </button>
            {!user && (
              <button
                className="btn ghost"
                onClick={() => onNavigate('/register')}
              >
                Создать аккаунт
              </button>
            )}
          </div>
        </div>
        <div className="hero-card">
          <div className="badge">Прямой эфир</div>
          {visiblePublicRoom ? (
            <div className="live-feed">
              {liveMessages.map((msg) => (
                <div className="live-item" key={`${msg.id}-${msg.createdAt}`}>
                  <span className="live-user">{msg.username}</span>
                  <span className="live-text">{msg.content}</span>
                </div>
              ))}
              {!liveMessages.length && (
                <p className="muted">Сообщений пока нет — будьте первым!</p>
              )}
            </div>
          ) : (
            <p className="muted">Загружаем публичный эфир...</p>
          )}
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Публичная комната</p>
              <h3>{visiblePublicRoom?.name || 'Комната для всех'}</h3>
            </div>
            <span className="pill">{isLoading ? 'загрузка...' : 'онлайн'}</span>
          </div>
          <p className="muted">
            Доступна только авторизованным пользователям. Сообщения сохраняются
            в базе.
          </p>
          <button
            className="btn primary"
            disabled={!user || !visiblePublicRoom}
            onClick={() =>
              onNavigate(
                `/rooms/${encodeURIComponent(
                  visiblePublicRoom?.slug || 'public'
                )}`
              )
            }
          >
            Войти в комнату
          </button>
          {!user && (
            <p className="note">Нужно войти, чтобы подключиться к чату.</p>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Своя комната</p>
              <h3>Создайте новую комнату</h3>
            </div>
          </div>
          <p className="muted">
            Нажмите кнопку, чтобы создать новую приватную комнату с уникальным именем. Мы
            проверим, что такой комнаты еще нет, и только после этого подключим вас.
          </p>
          <div className="form">
            <button
              className="btn outline"
              type="button"
              disabled={!user || creatingRoom}
              onClick={onCreateRoom}
            >
              {creatingRoom ? 'Создаем комнату...' : 'Создать комнату'}
            </button>
            {createError && <p className="note">{createError}</p>}
            {!user && <p className="note">Сначала войдите в аккаунт.</p>}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <p className="eyebrow">Кто онлайн</p>
            </div>
            <span className="pill">{online.length}</span>
          </div>
          {online.length ? (
            <div className="online-list">
              {online.map((u) => (
                <div className="online-item" key={u.username}>
                  <div className="avatar tiny">
                    {u.profileImage ? (
                      <img src={u.profileImage} alt={u.username} />
                    ) : (
                      <span>{u.username[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <span>{u.username}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Пока никого нет в сети.</p>
          )}
        </div>

        {!user && (
          <div className="card">
            <div className="card-header">
              <div>
                <p className="eyebrow">Не авторизованы</p>
                <h3>Войдите, чтобы начать</h3>
              </div>
              <span className="pill muted">Гость</span>
            </div>
            <p className="muted">
              Авторизация нужна только для подключения к чату. Регистрация — по
              логину и паролю без email-подтверждения.
            </p>
            <div className="actions">
              <button
                className="btn primary"
                type="button"
                onClick={() => onNavigate('/login')}
              >
                Войти
              </button>
              <button
                className="btn ghost"
                type="button"
                onClick={() => onNavigate('/register')}
              >
                Зарегистрироваться
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
