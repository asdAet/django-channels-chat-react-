import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useReconnectingWebSocket } from './useReconnectingWebSocket'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  public readyState = MockWebSocket.CONNECTING
  public onopen: ((event: Event) => void) | null = null
  public onclose: ((event: CloseEvent) => void) | null = null
  public onerror: ((event: Event) => void) | null = null
  public onmessage: ((event: MessageEvent) => void) | null = null
  public sent: string[] = []

  public readonly url: string
  public readonly protocols?: string | string[]

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    this.protocols = protocols
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code: 1000 } as CloseEvent)
  }

  triggerOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  triggerMessage(data: unknown) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }))
  }

  triggerError() {
    this.onerror?.(new Event('error'))
  }

  triggerClose(code = 1006) {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code } as CloseEvent)
  }
}

describe('useReconnectingWebSocket', () => {
  beforeEach(() => {
    vi.useRealTimers()
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket)
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('connects and allows send when socket is open', async () => {
    const { result } = renderHook(() =>
      useReconnectingWebSocket({
        url: 'ws://localhost/ws',
      }),
    )

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

    act(() => {
      MockWebSocket.instances[0].triggerOpen()
    })

    await waitFor(() => expect(result.current.status).toBe('online'))

    expect(result.current.send('ping')).toBe(true)
    expect(MockWebSocket.instances[0].sent).toEqual(['ping'])
  })

  it('reconnects after unexpected close with backoff', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const { result } = renderHook(() =>
      useReconnectingWebSocket({
        url: 'ws://localhost/ws',
        maxRetries: 2,
        baseDelayMs: 10,
        maxDelayMs: 20,
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })
    expect(MockWebSocket.instances).toHaveLength(1)

    act(() => {
      MockWebSocket.instances[0].triggerOpen()
      MockWebSocket.instances[0].triggerClose(1011)
    })

    expect(result.current.status).toBe('closed')

    act(() => {
      vi.advanceTimersByTime(15)
    })

    expect(MockWebSocket.instances).toHaveLength(2)
  })

  it('goes offline immediately when browser is offline', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })

    const { result } = renderHook(() =>
      useReconnectingWebSocket({
        url: 'ws://localhost/ws',
      }),
    )

    await waitFor(() => expect(result.current.status).toBe('offline'))
    expect(MockWebSocket.instances).toHaveLength(0)
  })


  it('marks error when retry limit is reached', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const { result } = renderHook(() =>
      useReconnectingWebSocket({
        url: 'ws://localhost/ws',
        maxRetries: 0,
        baseDelayMs: 10,
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      MockWebSocket.instances[0].triggerClose(1011)
    })

    expect(result.current.status).toBe('error')
    expect(result.current.lastError).toBe('reconnect_limit')
  })

  it('exposes connection error and send=false when not open', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() =>
      useReconnectingWebSocket({
        url: 'ws://localhost/ws',
        onError,
      }),
    )

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

    act(() => {
      MockWebSocket.instances[0].triggerError()
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('error')
    expect(result.current.lastError).toBe('connection_error')
    expect(result.current.send('x')).toBe(false)
  })

  it('calls onMessage callback', async () => {
    const onMessage = vi.fn()

    renderHook(() =>
      useReconnectingWebSocket({
        url: 'ws://localhost/ws',
        onMessage,
      }),
    )

    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

    act(() => {
      MockWebSocket.instances[0].triggerOpen()
      MockWebSocket.instances[0].triggerMessage({ type: 'event' })
    })

    expect(onMessage).toHaveBeenCalledTimes(1)
  })
})
