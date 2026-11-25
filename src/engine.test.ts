import { describe, expect, it } from 'vitest';
import {
  COLORS,
  CORRECT_POINTS,
  ROUND_SECONDS,
  SHAPES,
  WRONG_POINTS,
  applyScore,
  betterRecord,
  correctAnswer,
  createRound,
  judge,
  mulberry32,
  parseBest,
  recordBest,
  stimulusLabel,
  summarize,
  type Round,
} from './engine';

const seeded = mulberry32(42);

describe('cognitive switch rules', () => {
  it('creates a stimulus with a valid color and shape', () => {
    const round = createRound('color', seeded);
    expect(Object.keys(COLORS)).toContain(round.stimulus.color);
    expect(Object.keys(SHAPES)).toContain(round.stimulus.shape);
  });

  it('produces exactly four options containing the correct answer', () => {
    const round = createRound('shape', seeded);
    expect(round.options).toHaveLength(4);
    expect(new Set(round.options).size).toBe(4);
    expect(round.options).toContain(round.answer);
  });

  it('chooses color labels under the color rule', () => {
    expect(correctAnswer({ color: 'red', shape: 'circle' }, 'color')).toBe('橘红');
    expect(correctAnswer({ color: 'green', shape: 'circle' }, 'color')).toBe('墨绿');
  });

  it('chooses shape labels under the shape rule', () => {
    expect(correctAnswer({ color: 'red', shape: 'triangle' }, 'shape')).toBe('三角形');
    expect(correctAnswer({ color: 'red', shape: 'diamond' }, 'shape')).toBe('菱形');
  });

  it('labels stimuli in readable Chinese', () => {
    expect(stimulusLabel({ color: 'blue', shape: 'square' })).toBe('雾蓝方形');
    expect(stimulusLabel({ color: 'yellow', shape: 'circle' })).toBe('暖黄圆形');
  });

  it('scores correct and wrong answers differently', () => {
    const round: Round = {
      stimulus: { color: 'red', shape: 'circle' },
      rule: 'color',
      options: ['橘红', '墨绿', '雾蓝', '暖黄'],
      answer: '橘红',
    };
    expect(judge('橘红', round)).toEqual({ correct: true, delta: CORRECT_POINTS });
    expect(judge('墨绿', round)).toEqual({ correct: false, delta: -WRONG_POINTS });
    expect(applyScore(20, true)).toBe(30);
    expect(applyScore(2, false)).toBe(0);
  });

  it('summarizes accuracy as correct divided by answered', () => {
    const summary = summarize(7, 3, 2, ROUND_SECONDS);
    expect(summary.score).toBe(58);
    expect(summary.answered).toBe(10);
    expect(summary.accuracy).toBe(70);
    expect(summary.switches).toBe(2);
  });

  it('reports zero accuracy when no questions were answered', () => {
    const summary = summarize(0, 0, 0);
    expect(summary.answered).toBe(0);
    expect(summary.accuracy).toBe(0);
  });

  it('parses saved best records safely', () => {
    expect(parseBest(null)).toBeNull();
    expect(parseBest('bad json')).toBeNull();
    const best = parseBest(JSON.stringify({ score: 80, correct: 9, wrong: 1, accuracy: 90, switches: 3, seconds: 60 }));
    expect(best?.score).toBe(80);
    expect(best?.correct).toBe(9);
  });

  it('compares best records by score then accuracy', () => {
    const previous = parseBest(JSON.stringify({ score: 50, correct: 6, wrong: 1, accuracy: 85.7, switches: 1, seconds: 60 }));
    expect(betterRecord(summarize(5, 1, 0), previous)).toBe(false);
    expect(betterRecord(summarize(7, 1, 0), previous)).toBe(true);
  });

  it('stores only the improved best record', () => {
    const first = recordBest(null, summarize(5, 1, 1), new Date('2026-01-01'));
    expect(first.record.score).toBe(46);
    const worse = recordBest(first.raw, summarize(3, 5, 1), new Date('2026-01-02'));
    expect(worse.record.score).toBe(46);
    const better = recordBest(first.raw, summarize(8, 0, 2), new Date('2026-01-03'));
    expect(better.record.score).toBe(80);
  });

  it('uses deterministic seeded randomness for reproducible tests', () => {
    const first = mulberry32(9);
    const second = mulberry32(9);
    expect([first(), first(), first()]).toEqual([second(), second(), second()]);
  });
});
