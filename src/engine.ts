export type Rule = 'color' | 'shape';
export type ColorName = 'red' | 'green' | 'blue' | 'yellow';
export type ShapeName = 'circle' | 'square' | 'triangle' | 'diamond';
export type AnswerKind = 'correct' | 'wrong';

export interface Stimulus {
  color: ColorName;
  shape: ShapeName;
}

export interface Round {
  stimulus: Stimulus;
  rule: Rule;
  options: string[];
  answer: string;
}

export interface GameSummary {
  score: number;
  correct: number;
  wrong: number;
  answered: number;
  accuracy: number;
  switches: number;
  seconds: number;
}

export interface BestRecord extends GameSummary {
  at: string;
}

export const COLORS: Record<ColorName, { label: string; hex: string }> = {
  red: { label: '橘红', hex: '#cf4d2d' },
  green: { label: '墨绿', hex: '#174a3d' },
  blue: { label: '雾蓝', hex: '#527d91' },
  yellow: { label: '暖黄', hex: '#d7a63f' },
};

export const SHAPES: Record<ShapeName, { label: string }> = {
  circle: { label: '圆形' },
  square: { label: '方形' },
  triangle: { label: '三角形' },
  diamond: { label: '菱形' },
};

export const ROUND_SECONDS = 60;
export const CORRECT_POINTS = 10;
export const WRONG_POINTS = 4;

export function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function stimulusLabel(stimulus: Stimulus): string {
  return `${COLORS[stimulus.color].label}${SHAPES[stimulus.shape].label}`;
}

export function correctAnswer(stimulus: Stimulus, rule: Rule): string {
  return rule === 'color' ? COLORS[stimulus.color].label : SHAPES[stimulus.shape].label;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function ruleForQuestion(index: number, random: () => number = Math.random): { rule: Rule; boundary: boolean } {
  if (index <= 0) return { rule: random() < 0.5 ? 'color' : 'shape', boundary: false };
  const cycle = 3 + Math.floor(random() * 3);
  const position = index % cycle;
  const baseRule: Rule = Math.floor(index / cycle) % 2 === 0 ? 'color' : 'shape';
  return { rule: baseRule, boundary: position === 0 };
}

export function nextRule(current: Rule, questionIndex: number, random: () => number = Math.random): { rule: Rule; switched: boolean } {
  if (questionIndex === 0) return { rule: random() < 0.5 ? 'color' : 'shape', switched: false };
  const blockStart = questionIndex % (3 + Math.floor(random() * 3)) === 0;
  if (!blockStart) return { rule: current, switched: false };
  return { rule: current === 'color' ? 'shape' : 'color', switched: true };
}

export function createRound(rule: Rule, random: () => number = Math.random, previous?: Stimulus): Round {
  const colorKeys = Object.keys(COLORS) as ColorName[];
  const shapeKeys = Object.keys(SHAPES) as ShapeName[];
  let stimulus: Stimulus;
  do {
    stimulus = {
      color: colorKeys[Math.floor(random() * colorKeys.length)],
      shape: shapeKeys[Math.floor(random() * shapeKeys.length)],
    };
  } while (previous && stimulus.color === previous.color && stimulus.shape === previous.shape);

  const answer = correctAnswer(stimulus, rule);
  const pool = rule === 'color'
    ? colorKeys.map(key => COLORS[key].label)
    : shapeKeys.map(key => SHAPES[key].label);
  return {
    stimulus,
    rule,
    options: shuffled(pool, random),
    answer,
  };
}

export function judge(answer: string, round: Round): { correct: boolean; delta: number } {
  const correct = answer === round.answer;
  return {
    correct,
    delta: correct ? CORRECT_POINTS : -WRONG_POINTS,
  };
}

export function applyScore(score: number, answerCorrect: boolean): number {
  return Math.max(0, score + (answerCorrect ? CORRECT_POINTS : -WRONG_POINTS));
}

export function summarize(
  correct: number,
  wrong: number,
  switches: number,
  seconds = ROUND_SECONDS,
  score = Math.max(0, correct * CORRECT_POINTS - wrong * WRONG_POINTS),
): GameSummary {
  const answered = correct + wrong;
  return {
    score,
    correct,
    wrong,
    answered,
    accuracy: answered ? Math.round((correct / answered) * 1000) / 10 : 0,
    switches,
    seconds,
  };
}

export function parseBest(raw: string | null): BestRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<BestRecord>;
    if (
      !parsed ||
      !Number.isFinite(parsed.score) ||
      !Number.isFinite(parsed.correct) ||
      !Number.isFinite(parsed.wrong) ||
      !Number.isFinite(parsed.switches)
    ) {
      return null;
    }
    return summarize(
      Math.floor(parsed.correct as number),
      Math.floor(parsed.wrong as number),
      Math.floor(parsed.switches as number),
      Number.isFinite(parsed.seconds) ? Math.floor(parsed.seconds as number) : ROUND_SECONDS,
      Math.floor(parsed.score as number),
    ) && {
      score: Math.floor(parsed.score as number),
      correct: Math.floor(parsed.correct as number),
      wrong: Math.floor(parsed.wrong as number),
      answered: Math.floor((parsed.correct as number) + (parsed.wrong as number)),
      accuracy: Number.isFinite(parsed.accuracy) ? Number(parsed.accuracy) : 0,
      switches: Math.floor(parsed.switches as number),
      seconds: Number.isFinite(parsed.seconds) ? Math.floor(parsed.seconds as number) : ROUND_SECONDS,
      at: typeof parsed.at === 'string' ? parsed.at : '',
    };
  } catch {
    return null;
  }
}

export function betterRecord(candidate: GameSummary, previous: BestRecord | null): boolean {
  if (!previous) return true;
  if (candidate.score !== previous.score) return candidate.score > previous.score;
  if (candidate.accuracy !== previous.accuracy) return candidate.accuracy > previous.accuracy;
  return candidate.correct > previous.correct;
}

export function recordBest(raw: string | null, summary: GameSummary, now = new Date()): { raw: string; record: BestRecord } {
  const previous = parseBest(raw);
  const winner = betterRecord(summary, previous) ? summary : previous;
  const record: BestRecord = {
    ...(winner ?? summary),
    at: now.toISOString(),
  };
  return { raw: JSON.stringify(record), record };
}

export function injectTestHooks(): void {
  if (typeof window !== 'undefined') {
    (window as unknown as { __cognitiveTest?: unknown }).__cognitiveTest = {
      summarize,
      correctAnswer,
      createRound,
    };
  }
}
