// Сохранение: localStorage на устройстве + Telegram CloudStorage, чтобы питомец
// был один и тот же на телефоне и на компьютере. Из двух копий берём более новую.

import { emptySave, type SaveData } from './game'
import { cloud } from './telegram'

const LOCAL_KEY = 'habit-pet-save'
const CHUNK = 4000 // CloudStorage хранит до 4096 символов в одном ключе
const COUNT_KEY = 'save_n'

function parse(raw: string | null | undefined): SaveData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as SaveData
    return data.version === 1 ? data : null
  } catch {
    return null
  }
}

function loadLocal(): SaveData | null {
  try {
    return parse(localStorage.getItem(LOCAL_KEY))
  } catch {
    return null
  }
}

function loadCloud(): Promise<SaveData | null> {
  const cs = cloud()
  if (!cs) return Promise.resolve(null)
  return new Promise((resolve) => {
    cs.getItem(COUNT_KEY, (err, n) => {
      const count = Number(n)
      if (err || !count) return resolve(null)
      const keys = Array.from({ length: count }, (_, i) => `save_${i}`)
      cs.getItems(keys, (err2, values) => {
        if (err2 || !values) return resolve(null)
        resolve(parse(keys.map((k) => values[k] ?? '').join('')))
      })
    })
  })
}

export async function loadSave(): Promise<SaveData> {
  const local = loadLocal()
  const remote = await loadCloud().catch(() => null)
  const best = [local, remote]
    .filter((s): s is SaveData => !!s)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
  return best ?? emptySave()
}

let cloudTimer: number | undefined

export function persist(data: SaveData) {
  const raw = JSON.stringify(data)
  try {
    localStorage.setItem(LOCAL_KEY, raw)
  } catch {
    /* приватный режим — живём без локальной копии */
  }
  const cs = cloud()
  if (!cs) return
  // Облако пишем с задержкой, чтобы не слать запрос на каждую галочку.
  window.clearTimeout(cloudTimer)
  cloudTimer = window.setTimeout(() => {
    const parts = raw.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? ['']
    parts.forEach((p, i) => cs.setItem(`save_${i}`, p))
    cs.setItem(COUNT_KEY, String(parts.length))
  }, 800)
}
