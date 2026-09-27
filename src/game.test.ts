import { describe, expect, it } from 'vitest'
import { addDays, buryPet, computePet, emptySave, stageOf, toggleHabit, type SaveData } from './game'

const START = '2026-09-01'

function save(habitCount: number, log: Record<string, string[]> = {}): SaveData {
  const s = emptySave()
  s.pet = { name: 'Мята', bornOn: START }
  s.habits = Array.from({ length: habitCount }, (_, i) => ({
    id: `h${i}`,
    title: `Привычка ${i}`,
    emoji: '*',
    createdOn: START,
  }))
  s.log = log
  return s
}

// Все привычки отмечены в каждый из первых n дней.
function fullDays(n: number, habits: number): Record<string, string[]> {
  const log: Record<string, string[]> = {}
  for (let i = 0; i < n; i++) log[addDays(START, i)] = Array.from({ length: habits }, (_, j) => `h${j}`)
  return log
}

describe('computePet', () => {
  it('новое яйцо', () => {
    const st = computePet(save(3), START)!
    expect(st.stage).toBe('egg')
    expect(st.xp).toBe(0)
    expect(st.alive).toBe(true)
    expect(st.daysLived).toBe(1)
  })

  it('отметка даёт опыт и бонус за стрик', () => {
    const st = computePet(save(3, { [START]: ['h0', 'h1'] }), START)!
    expect(st.xp).toBe(2 * 10 + 2)
    expect(st.doneToday).toEqual(['h0', 'h1'])
    expect(st.streak).toBe(1)
  })

  it('снятая галочка откатывает опыт', () => {
    let s = toggleHabit(save(3), 'h0', START)
    s = toggleHabit(s, 'h0', START)
    expect(computePet(s, START)!.xp).toBe(0)
  })

  it('3 привычки в день выводят малыша в первый же день', () => {
    const st = computePet(save(3, fullDays(1, 3)), START)!
    expect(stageOf(st.xp)).toBe('egg') // 32 XP
    const st2 = computePet(save(3, fullDays(2, 3)), addDays(START, 1))!
    expect(st2.stage).toBe('baby')
  })

  it('стадия «Легенда» примерно за месяц при 3 привычках в день', () => {
    const today = addDays(START, 29)
    const st = computePet(save(3, fullDays(30, 3)), today)!
    expect(st.stage).toBe('legend')
    expect(st.alive).toBe(true)
  })

  it('яйцо не умирает без отметок', () => {
    const st = computePet(save(3), addDays(START, 30))!
    expect(st.alive).toBe(true)
    expect(st.stage).toBe('egg')
  })

  it('заброшенный питомец умирает примерно через 4 дня', () => {
    const log = fullDays(2, 3) // вылупился и сыт
    const s = save(3, log)
    const alive = computePet(s, addDays(START, 5))!
    expect(alive.alive).toBe(true)
    const dead = computePet(s, addDays(START, 10))!
    expect(dead.alive).toBe(false)
    expect(dead.diedOn! > addDays(START, 4)).toBe(true)
  })

  it('без отметки сегодня стрик вчерашнего дня ещё виден', () => {
    const st = computePet(save(1, fullDays(3, 1)), addDays(START, 3))!
    expect(st.streak).toBe(3)
  })

  it('привычка, добавленная позже, не штрафует прошлые дни', () => {
    const s = save(1, fullDays(5, 1))
    s.habits.push({ id: 'late', title: 'Поздняя', emoji: '*', createdOn: addDays(START, 4) })
    const withLate = computePet(s, addDays(START, 4))!
    const without = computePet(save(1, fullDays(5, 1)), addDays(START, 4))!
    expect(withLate.mood).toBe(without.mood)
  })

  it('похороны переносят питомца на кладбище', () => {
    const s = save(3, fullDays(2, 3))
    const st = computePet(s, addDays(START, 20))!
    const after = buryPet(s, st)
    expect(after.pet).toBeNull()
    expect(after.graves).toHaveLength(1)
    expect(after.graves[0].name).toBe('Мята')
  })
})
