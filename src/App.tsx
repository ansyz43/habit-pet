import { useEffect, useMemo, useRef, useState } from 'react'
import {
  RULES,
  STAGES,
  activeHabits,
  addDays,
  buryPet,
  computePet,
  emptySave,
  newId,
  stageName,
  toISO,
  toggleHabit,
  type Habit,
  type PetState,
  type SaveData,
  type StageId,
} from './game'
import { loadSave, persist } from './storage'
import { haptic, initTelegram } from './telegram'
import { Sprite, preloadSprites, type SetName } from './Sprite'

const TEMPLATES: Omit<Habit, 'id' | 'createdOn'>[] = [
  { emoji: '💧', title: 'Выпить 8 стаканов воды' },
  { emoji: '🏃', title: 'Зарядка 10 минут' },
  { emoji: '📖', title: 'Читать 20 минут' },
  { emoji: '😴', title: 'Лечь спать до 23:00' },
  { emoji: '🌳', title: 'Прогулка 30 минут' },
  { emoji: '🧘', title: 'Медитация 5 минут' },
  { emoji: '🍬', title: 'День без сладкого' },
  { emoji: '🇬🇧', title: 'Английский 15 минут' },
]
const MAX_HABITS = 8

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
}

// Режим отладки (?debug в адресе): перемотка дней и ночь по кнопке.
const DEBUG = new URLSearchParams(location.search).has('debug')

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(t)
  }, [])
  return now
}

type Tab = 'pet' | 'habits' | 'progress'

export default function App() {
  const [save, setSave] = useState<SaveData | null>(null)
  const [tab, setTab] = useState<Tab>('pet')
  const [dayOffset, setDayOffset] = useState(0)
  const [timeMode, setTimeMode] = useState<'auto' | 'day' | 'night'>('auto')
  const now = useClock()

  useEffect(() => {
    initTelegram()
    preloadSprites()
    loadSave().then(setSave)
  }, [])

  const today = addDays(toISO(now), dayOffset)
  const hour = now.getHours()
  const night = timeMode === 'auto' ? hour >= 23 || hour < 7 : timeMode === 'night'

  const update = (fn: (s: SaveData) => SaveData) =>
    setSave((prev) => {
      if (!prev) return prev
      const next = { ...fn(prev), updatedAt: Date.now() }
      persist(next)
      return next
    })

  const state = useMemo(() => (save ? computePet(save, today) : null), [save, today])

  if (!save) return <div className="loading">Загрузка…</div>

  let screen
  if (!save.pet) screen = <Onboarding save={save} today={today} update={update} />
  else if (state && !state.alive)
    screen = <Death save={save} state={state} onRestart={() => update((s) => buryPet(s, state))} />
  else
    screen = (
      <>
        <main className="screen">
          {tab === 'pet' && (
            <Home save={save} state={state!} today={today} night={night} update={update} goHabits={() => setTab('habits')} />
          )}
          {tab === 'habits' && <Habits save={save} today={today} update={update} />}
          {tab === 'progress' && <Progress save={save} state={state!} today={today} />}
        </main>
        <nav className="tabs">
          {(
            [
              ['pet', '🐾', 'Питомец'],
              ['habits', '✅', 'Привычки'],
              ['progress', '📈', 'Прогресс'],
            ] as const
          ).map(([id, icon, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              <span className="tab-icon">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      </>
    )

  return (
    <div className="app">
      {screen}
      {DEBUG && (
        <div className="debug">
          <span>{today}</span>
          {save.pet && state?.alive && (
            <button onClick={() => update((s) => ({ ...s, bonusXp: (s.bonusXp ?? 0) + 100 }))}>+100 XP</button>
          )}
          <button onClick={() => setDayOffset((d) => d + 1)}>+1 день</button>
          <button onClick={() => setTimeMode((m) => (m === 'auto' ? 'day' : m === 'day' ? 'night' : 'auto'))}>
            {timeMode === 'auto' ? 'Время: авто' : timeMode === 'day' ? 'Время: день' : 'Время: ночь'}
          </button>
          <button
            onClick={() => {
              // Пишем пустое сохранение поверх — иначе облачная копия Telegram вернёт старое.
              persist({ ...emptySave(), updatedAt: Date.now() })
              window.setTimeout(() => location.reload(), 1500)
            }}
          >
            Сброс
          </button>
        </div>
      )}
    </div>
  )
}

type Update = (fn: (s: SaveData) => SaveData) => void

/* ---------- Главный экран ---------- */

interface OneShot {
  set: SetName
  anim: string
  fx?: string
}

function Home({
  save,
  state,
  today,
  night,
  update,
  goHabits,
}: {
  save: SaveData
  state: PetState
  today: string
  night: boolean
  update: Update
  goHabits: () => void
}) {
  const [shot, setShot] = useState<OneShot | null>(null)
  const [fx, setFxState] = useState<{ name: string; id: number } | null>(null)
  const setFx = (name: string | null) => setFxState(name ? { name, id: Math.random() } : null)
  const prevStage = useRef<StageId>(state.stage)

  // Смена стадии: вылупление или вспышка эволюции.
  useEffect(() => {
    const prev = prevStage.current
    prevStage.current = state.stage
    if (prev === state.stage) return
    const up = STAGES.findIndex((s) => s.id === state.stage) > STAGES.findIndex((s) => s.id === prev)
    if (!up) return
    haptic('success')
    if (prev === 'egg') setShot({ set: 'egg', anim: 'hatch', fx: 'evolve' })
    else setFx('evolve')
  }, [state.stage])

  const habits = activeHabits(save.habits, today)
  const isEgg = state.stage === 'egg'
  const sad = state.satiety < RULES.sadBelow || state.mood < RULES.sadBelow

  let base: OneShot
  if (isEgg) base = { set: 'egg', anim: 'idle' }
  else if (night) base = { set: state.stage as SetName, anim: 'sleep' }
  else if (sad) base = { set: state.stage as SetName, anim: 'sad' }
  else base = { set: state.stage as SetName, anim: 'idle' }
  const current = shot ?? base

  const check = (h: Habit) => {
    const wasDone = state.doneToday.includes(h.id)
    update((s) => toggleHabit(s, h.id, today))
    if (wasDone) {
      haptic('tap')
      return
    }
    haptic('success')
    if (!isEgg && !night) setShot({ set: state.stage as SetName, anim: 'happy' })
    setFx('hearts')
  }

  const stageIdx = STAGES.findIndex((s) => s.id === state.stage)
  const from = STAGES[stageIdx].xp
  const xpPct = state.next ? ((state.xp - from) / (state.next.xp - from)) * 100 : 100
  const name = save.pet!.name

  let mood = `${name} в отличном настроении`
  if (isEgg) mood = 'Яйцо греется. Отмечай привычки — и оно вылупится'
  else if (night) mood = `${name} спит`
  else if (state.satiety <= 25) mood = `${name} очень голоден! Ещё немного — и будет поздно`
  else if (state.satiety <= RULES.warnBelow) mood = `${name} проголодался — отметь привычку`
  else if (sad) mood = `${name} грустит`
  else if (state.doneToday.length === habits.length && habits.length > 0) mood = `${name} сыт и счастлив`

  return (
    <div className="home">
      <header className="pet-header">
        <h1>{name}</h1>
        <span className="chip">{stageName(state.stage)}</span>
      </header>

      <div className={`room ${night ? 'night' : ''}`}>
        <div className={`pet-wrap ${current.anim === 'idle' ? 'bob' : ''}`}>
          <div className="shadow" />
          <Sprite
            key={`${current.set}-${current.anim}`}
            set={current.set}
            anim={current.anim}
            onEnd={() => {
              if (shot?.fx) setFx(shot.fx)
              setShot(null)
            }}
          />
          {night && !isEgg && <Sprite className="fx zzz" set="fx" anim="zzz" scale={1} />}
          {fx && <Sprite key={fx.id} className="fx" set="fx" anim={fx.name} onEnd={() => setFx(null)} />}
        </div>
      </div>

      <p className={`status ${state.satiety <= RULES.warnBelow && !isEgg ? 'warn' : ''}`}>{mood}</p>

      <div className="bars">
        <Bar label={state.next ? `Опыт до «${stageName(state.next.stage)}»` : 'Опыт — максимум'} value={xpPct} text={`${state.xp} XP`} kind="xp" />
        {!isEgg && <Bar label="Сытость" value={state.satiety} text={`${state.satiety}`} kind="food" />}
        {!isEgg && <Bar label="Настроение" value={state.mood} text={`${state.mood}`} kind="mood" />}
      </div>

      <section className="today">
        <h2>
          Сегодня <span className="muted">{state.doneToday.length} из {habits.length}</span>
        </h2>
        {habits.length === 0 && (
          <button className="primary" onClick={goHabits}>
            Добавить привычки
          </button>
        )}
        {habits.map((h) => {
          const done = state.doneToday.includes(h.id)
          return (
            <button key={h.id} className={`habit ${done ? 'done' : ''}`} onClick={() => check(h)}>
              <span className="emoji">{h.emoji}</span>
              <span className="title">{h.title}</span>
              <span className="box">{done ? '✓' : ''}</span>
            </button>
          )
        })}
      </section>
    </div>
  )
}

function Bar({ label, value, text, kind }: { label: string; value: number; text: string; kind: string }) {
  return (
    <div className="bar">
      <div className="bar-label">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <div className="bar-track">
        <div className={`bar-fill ${kind} ${value <= RULES.sadBelow && kind !== 'xp' ? 'low' : ''}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

/* ---------- Привычки ---------- */

function Habits({ save, today, update }: { save: SaveData; today: string; update: Update }) {
  const habits = activeHabits(save.habits, today)
  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('⭐')
  const full = habits.length >= MAX_HABITS

  const add = (t: Omit<Habit, 'id' | 'createdOn'>) => {
    if (full || !t.title.trim()) return
    haptic('tap')
    update((s) => ({ ...s, habits: [...s.habits, { ...t, title: t.title.trim(), id: newId(), createdOn: today }] }))
  }
  const remove = (id: string) =>
    update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? { ...h, archivedOn: today } : h)) }))

  const free = TEMPLATES.filter((t) => !habits.some((h) => h.title === t.title))

  return (
    <div className="page">
      <h1>Привычки</h1>
      <p className="muted">
        Каждая отметка — +{RULES.xpPerHabit} XP и еда для питомца. Не больше {MAX_HABITS} привычек.
      </p>
      {habits.map((h) => (
        <div key={h.id} className="habit static">
          <span className="emoji">{h.emoji}</span>
          <span className="title">{h.title}</span>
          <button className="icon-btn" aria-label="Удалить" onClick={() => remove(h.id)}>
            ✕
          </button>
        </div>
      ))}

      <h2>Своя привычка</h2>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault()
          add({ emoji: emoji || '⭐', title })
          setTitle('')
        }}
      >
        <input className="emoji-input" value={emoji} maxLength={2} onChange={(e) => setEmoji(e.target.value)} aria-label="Иконка" />
        <input value={title} maxLength={40} placeholder="Например, 10 000 шагов" onChange={(e) => setTitle(e.target.value)} />
        <button className="primary" disabled={full || !title.trim()}>
          +
        </button>
      </form>

      {free.length > 0 && (
        <>
          <h2>Шаблоны</h2>
          <div className="templates">
            {free.map((t) => (
              <button key={t.title} className="template" disabled={full} onClick={() => add(t)}>
                {t.emoji} {t.title}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* ---------- Прогресс ---------- */

function Progress({ save, state, today }: { save: SaveData; state: PetState; today: string }) {
  const [y, m] = today.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const daysInMonth = new Date(y, m, 0).getDate()
  const lead = (first.getDay() + 6) % 7 // понедельник — первый
  const monthName = first.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })

  return (
    <div className="page">
      <h1>Прогресс</h1>
      <div className="stats">
        <Stat value={state.streak} label="дней подряд" />
        <Stat value={state.daysLived} label="дней вместе" />
        <Stat value={state.xp} label="опыта" />
      </div>

      <h2>Путь питомца</h2>
      <div className="stages">
        {STAGES.map((s) => {
          const reached = state.xp >= s.xp
          return (
            <div key={s.id} className={`stage ${reached ? 'reached' : ''} ${s.id === state.stage ? 'current' : ''}`}>
              <Sprite set={s.id as SetName} anim="idle" scale={0.5} />
              <span>{s.name}</span>
              <span className="muted">{s.xp} XP</span>
            </div>
          )
        })}
      </div>

      <h2 className="cap">{monthName}</h2>
      <div className="calendar">
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
          <span key={d} className="dow">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = toISO(new Date(y, m - 1, i + 1))
          const total = activeHabits(save.habits, day).length
          const done = (save.log[day] ?? []).length
          const level = day > today || total === 0 || (day === today && done === 0) ? -1 : Math.min(4, Math.ceil((done / total) * 4))
          return (
            <span key={day} className={`day l${level} ${day === today ? 'today' : ''}`}>
              {i + 1}
            </span>
          )
        })}
      </div>

      {save.graves.length > 0 && (
        <>
          <h2>Кладбище</h2>
          {save.graves
            .slice()
            .reverse()
            .map((g) => (
              <div key={g.bornOn + g.name} className="grave-row">
                🪦 <b>{g.name}</b> — {stageName(g.stage)}, {g.xp} XP, умер {fmtDate(g.diedOn)}
              </div>
            ))}
        </>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  )
}

/* ---------- Онбординг ---------- */

function Onboarding({ save, today, update }: { save: SaveData; today: string; update: Update }) {
  const hasHabits = activeHabits(save.habits, today).length > 0
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const reborn = save.graves.length > 0

  const start = () => {
    haptic('success')
    update((s) => ({
      ...s,
      pet: { name: name.trim(), bornOn: today },
      habits: hasHabits
        ? s.habits
        : TEMPLATES.filter((t) => picked.includes(t.title)).map((t) => ({ ...t, id: newId(), createdOn: today })),
    }))
  }

  const ready = name.trim() && (hasHabits || picked.length > 0)

  return (
    <div className="page onboarding">
      <div className="room small">
        <div className="pet-wrap bob">
          <div className="shadow" />
          <Sprite set="egg" anim="idle" />
        </div>
      </div>
      <h1>{reborn ? 'Новое яйцо' : 'Привет! Это твоё яйцо'}</h1>
      <p className="muted">
        Выполняй привычки — питомец вылупится и будет расти. Если забросить его на несколько дней, он умрёт.
      </p>
      <label className="field">
        <span>Как назовём?</span>
        <input value={name} maxLength={16} placeholder="Мята" onChange={(e) => setName(e.target.value)} />
      </label>
      {!hasHabits && (
        <>
          <h2>Выбери 1–3 привычки</h2>
          <div className="templates">
            {TEMPLATES.map((t) => {
              const on = picked.includes(t.title)
              return (
                <button
                  key={t.title}
                  className={`template ${on ? 'on' : ''}`}
                  disabled={!on && picked.length >= 3}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== t.title) : [...p, t.title]))}
                >
                  {t.emoji} {t.title}
                </button>
              )
            })}
          </div>
        </>
      )}
      <button className="primary big" disabled={!ready} onClick={start}>
        Начать
      </button>
    </div>
  )
}

/* ---------- Смерть ---------- */

function Death({ save, state, onRestart }: { save: SaveData; state: PetState; onRestart: () => void }) {
  return (
    <div className="page death">
      <div className="room night">
        <div className="pet-wrap">
          <Sprite set="death" anim="grave" />
          <Sprite className="fx ghost" set="death" anim="ghost" scale={1.25} />
        </div>
      </div>
      <h1>Прощай, {save.pet!.name}</h1>
      <p className="muted">
        Питомец прожил {state.daysLived} дн., дошёл до стадии «{stageName(state.stage)}» и набрал {state.xp} XP. Питомец не
        выдержал голода: несколько дней подряд без отметок.
      </p>
      <button className="primary big" onClick={onRestart}>
        Новое яйцо
      </button>
    </div>
  )
}
