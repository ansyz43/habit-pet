// Тонкая обёртка над Telegram WebApp SDK (скрипт подключён в index.html).
// Вне Telegram (обычный браузер) все вызовы безопасно ничего не делают.

interface CloudStorage {
  setItem(key: string, value: string, cb?: (err: unknown, ok?: boolean) => void): void
  getItem(key: string, cb: (err: unknown, value?: string) => void): void
  getItems(keys: string[], cb: (err: unknown, values?: Record<string, string>) => void): void
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name?: string } }
  platform: string
  colorScheme: 'light' | 'dark'
  isVersionAtLeast(v: string): boolean
  ready(): void
  expand(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void
    notificationOccurred(type: 'error' | 'success' | 'warning'): void
  }
  CloudStorage?: CloudStorage
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp }
  }
}

export const tg: TelegramWebApp | null =
  window.Telegram?.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null

export function initTelegram() {
  if (!tg) return
  tg.ready()
  tg.expand()
  if (tg.isVersionAtLeast('6.1')) {
    tg.setHeaderColor('#e4f5d7')
    tg.setBackgroundColor('#fcf7ec')
  }
}

export function haptic(kind: 'tap' | 'success' | 'warning') {
  const h = tg?.isVersionAtLeast('6.1') ? tg.HapticFeedback : undefined
  if (!h) return
  if (kind === 'tap') h.impactOccurred('light')
  else h.notificationOccurred(kind)
}

export function cloud(): CloudStorage | null {
  return tg && tg.isVersionAtLeast('6.9') && tg.CloudStorage ? tg.CloudStorage : null
}
