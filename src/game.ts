// Логика питомца. Состояние не хранится, а каждый раз пересчитывается
// из истории отметок: так снятая галочка честно откатывает опыт и сытость.

export type StageId = 'egg' | 'baby' | 'teen' | 'adult' | 'legend'

export interface Habit {
  id: string
  title: string
  emoji: string
  createdOn: string // YYYY-MM-DD
  archivedOn?: string // с этого дня привычка больше не учитывается
}

export interface Pet {
  name: string
  bornOn: string
}

export interface Grave {
  name: string
  bornOn: string
  diedOn: string
  stage: StageId
  xp: number
}

export interface SaveData {
  version: 1
  updatedAt: number
  pet: Pet | null
  habits: Habit[]
  log: Record<string, string[]> // дата → id выполненных привычек
  graves: Grave[]
  bonusXp?: number // только для тестового режима (?debug)
}

export interface PetState {
  stage: StageId
  xp: number
  satiety: number
  mood: number
  streak: number
  alive: boolean
  diedOn?: string
  daysLived: number
  doneToday: string[]
  next: { stage: StageId; xp: number } | null
}

export const STAGES: { id: StageId; name: string; xp: number }[] = [
  { id: 'egg', name: 'Яйцо', xp: 0 },
  { id: 'baby', name: 'Малыш', xp: 50 },
  { id: 'teen', name: 'Подросток', xp: 250 },
  { id: 'adult', name: 'Взрослый', xp: 600 },
  { id: 'legend', name: 'Легенда', xp: 1000 },
]

export const RULES = {
  startSatiety: 70,
  startMood: 70,
  xpPerHabit: 10,
  streakBonusPerDay: 2, // бонус = min(стрик, 10) × 2 за первый день с отметкой
  streakBonusCap: 10,
  satietyPerHabit: 15,
  moodPerHabit: 10,
  dailyHunger: 10, // сытость, которую питомец теряет за любой прошедший день
  emptyDayHunger: 15, // дополнительно, если за день нет ни одной отметки
  emptyDayMoodLoss: 20,
  missedHabitMoodLoss: 5,
  sadBelow: 30,
  warnBelow: 50,
}

export function emptySave(): SaveData {
  return { version: 1, updatedAt: 0, pet: null, habits: [], log: {}, graves: [] }
}

export function stageOf(xp: number): StageId {
  let id: StageId = 'egg'
  for (const s of STAGES) if (xp >= s.xp) id = s.id
  return id
}

export function stageName(id: StageId): string {
  return STAGES.find((s) => s.id === id)!.name
}

export function toISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toISO(new Date(y, m - 1, d + n))
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split('-').map(Number)
  const [y2, m2, d2] = to.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5)
}

export function activeHabits(habits: Habit[], day: string): Habit[] {
  return habits.filter((h) => h.createdOn <= day && (!h.archivedOn || h.archivedOn > day))
}

const clamp = (v: number) => Math.max(0, Math.min(100, v))

export function computePet(save: SaveData, today: string): PetState | null {
  const pet = save.pet
  if (!pet) return null

  let xp = save.bonusXp ?? 0
  let satiety = RULES.startSatiety
  let mood = RULES.startMood
  let streak = 0
  let diedOn: string | undefined
  let doneToday: string[] = []

  for (let day = pet.bornOn; day <= today; day = addDays(day, 1)) {
    const active = activeHabits(save.habits, day)
    const ids = new Set(active.map((h) => h.id))
    const done = (save.log[day] ?? []).filter((id) => ids.has(id))
    const n = done.length
    const isEgg = stageOf(xp) === 'egg'

    if (n > 0) {
      streak += 1
      xp += n * RULES.xpPerHabit + Math.min(streak, RULES.streakBonusCap) * RULES.streakBonusPerDay
      satiety = clamp(satiety + n * RULES.satietyPerHabit)
      mood = clamp(mood + n * RULES.moodPerHabit)
    }

    if (day === today) {
      doneToday = done
      break
    }

    // День закончился: подводим итоги. Яйцо не голодает.
    if (n === 0) streak = 0
    if (isEgg) continue
    if (n === 0) {
      satiety -= RULES.dailyHunger + RULES.emptyDayHunger
      mood -= RULES.emptyDayMoodLoss
    } else {
      satiety -= RULES.dailyHunger
      mood -= (active.length - n) * RULES.missedHabitMoodLoss
    }
    satiety = clamp(satiety)
    mood = clamp(mood)
    if (satiety <= 0) {
      diedOn = addDays(day, 1)
      break
    }
  }

  const stage = stageOf(xp)
  const idx = STAGES.findIndex((s) => s.id === stage)
  const nextStage = STAGES[idx + 1]
  return {
    stage,
    xp,
    satiety,
    mood,
    streak,
    alive: !diedOn,
    diedOn,
    daysLived: daysBetween(pet.bornOn, diedOn ?? today) + 1,
    doneToday,
    next: nextStage ? { stage: nextStage.id, xp: nextStage.xp } : null,
  }
}

export function toggleHabit(save: SaveData, habitId: string, day: string): SaveData {
  const list = save.log[day] ?? []
  const next = list.includes(habitId) ? list.filter((id) => id !== habitId) : [...list, habitId]
  return { ...save, log: { ...save.log, [day]: next } }
}

export function buryPet(save: SaveData, state: PetState): SaveData {
  if (!save.pet || state.alive) return save
  const grave: Grave = {
    name: save.pet.name,
    bornOn: save.pet.bornOn,
    diedOn: state.diedOn!,
    stage: state.stage,
    xp: state.xp,
  }
  return { ...save, pet: null, bonusXp: 0, graves: [...save.graves, grave] }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
