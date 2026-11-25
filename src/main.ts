import './style.css';
import { icon } from './icons';
import {
  COLORS,
  ROUND_SECONDS,
  applyScore,
  correctAnswer,
  createRound,
  judge,
  parseBest,
  recordBest,
  summarize,
  type GameSummary,
  type Round,
  type Rule,
} from './engine';

const SAVE_KEY = '{{SECRET_bvdwht6h}}';
const appElement = document.querySelector<HTMLDivElement>('#app');
if (!appElement) throw new Error('缺少应用挂载节点');
const app: HTMLDivElement = appElement;

let running = false;
let timeLeft = ROUND_SECONDS;
let round: Round | null = null;
let rule: Rule = 'color';
let score = 0;
let correct = 0;
let wrong = 0;
let switches = 0;
let questionsSinceSwitch = 0;
let questionsUntilSwitch = randomSwitchLength();
let timer: number | undefined;
let toastTimer: number | undefined;
let locked = false;

function randomSwitchLength(): number {
  return 3 + Math.floor(Math.random() * 3);
}

function renderShell(): void {
  app.innerHTML = `
    <div class="paper-shell">
      <header class="topbar">
        <a class="brand" href="./" aria-label="思维切换首页">
          <span class="brand-mark">${icon('shape')}</span>
          <span class="brand-copy">
            <strong>思维切换</strong>
            <small>JOKE BEAR'S SWITCH PRACTICE</small>
          </span>
        </a>
        <div class="best-pill" aria-label="最佳成绩">
          ${icon('spark')} <span id="best-pill">最佳：尚无记录</span>
        </div>
      </header>

      <main class="layout">
        <section class="game-card" aria-labelledby="game-title">
          <div class="game-heading">
            <div>
              <p class="eyebrow">小熊的颜色形状练习</p>
              <h1 id="game-title">看清规则，再按下答案</h1>
              <p class="lede">规则会在“按颜色”和“按形状”之间切换。60 秒内尽量答对，答错会扣分。键盘可按 1、2、3、4。</p>
            </div>
            <div class="stat-strip" aria-label="本局数据">
              <div class="stat"><span>${icon('timer')} 剩余</span><strong id="stat-time">60</strong></div>
              <div class="stat"><span>${icon('spark')} 得分</span><strong id="stat-score">0</strong></div>
              <div class="stat"><span>${icon('check')} 正确</span><strong id="stat-correct">0</strong></div>
            </div>
          </div>

          <div class="rule-card" id="rule-card" data-rule="color">
            <span class="rule-kicker">当前规则</span>
            <strong id="rule-text">按颜色</strong>
            <span id="rule-hint">看颜色，不管形状</span>
          </div>

          <div class="stimulus-stage">
            <div id="stimulus" class="stimulus" aria-label="当前图形">
              ${shapeSvg('circle', COLORS.red.hex)}
            </div>
            <p id="stimulus-caption" class="stimulus-caption">准备好后点击开始</p>
          </div>

          <div id="feedback" class="feedback" role="status" aria-live="polite">答对加 10 分，答错扣 4 分。</div>

          <div class="answer-grid" id="answer-grid" aria-label="答案选项"></div>

          <div class="action-row">
            <button class="primary-button" type="button" data-action="start">${icon('play')} 开始 60 秒</button>
            <button class="secondary-button" type="button" data-action="reset">${icon('reset')} 重新开始</button>
          </div>
        </section>

        <aside class="bear-aside" aria-label="小熊陪伴">
          <div class="bear-card">
            <div class="bear-halo"></div>
            <img class="bear-image" src="./characters/classic.webp" alt="Joke Bear 小熊" width="320" height="320" />
            <span class="tape tape-one" aria-hidden="true"></span>
            <span class="tape tape-two" aria-hidden="true"></span>
          </div>
          <div class="bear-side-copy">
            <p class="speech-kicker">小熊说</p>
            <p id="bear-bubble" class="bear-bubble">先别急着快。看清上面的规则，再看图形的颜色或形状。</p>
            <div class="mini-progress">
              <span class="mini-progress-top"><span>规则切换</span><strong id="switch-count">0 次</strong></span>
              <div class="progress-track" role="progressbar" aria-label="剩余时间" aria-valuemin="0" aria-valuemax="60" aria-valuenow="60">
                <span id="time-fill"></span>
              </div>
            </div>
            <div class="best-note">${icon('info')}<span>规则每隔三到五题切换一次；规则牌会轻轻提醒你。</span></div>
          </div>
        </aside>
      </main>

      <footer class="footer">
        <span>Joke Bear 的安静小游戏</span>
        <span class="footer-dot" aria-hidden="true"></span>
        <span>最佳成绩保存在本机</span>
      </footer>
    </div>
    <div id="end-root"></div>
    <div id="toast" class="toast" role="status"></div>
    <div id="live" class="sr-only" aria-live="polite"></div>
  `;
  app.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeyDown);
  renderIdle();
}

function onClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const answer = target.closest<HTMLButtonElement>('[data-answer]');
  if (answer) {
    answerQuestion(answer.dataset.answer || '');
    return;
  }
  const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'start') startGame();
  if (action === 'reset') resetGame();
  if (action === 'overlay-close') closeOverlay();
  if (action === 'overlay-replay') {
    closeOverlay();
    startGame();
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (['1', '2', '3', '4'].includes(event.key)) {
    event.preventDefault();
    const index = Number(event.key) - 1;
    document.querySelector<HTMLButtonElement>(`[data-answer-index="${index}"]`)?.click();
  }
  if (event.key.toLowerCase() === 'r') {
    event.preventDefault();
    resetGame();
  }
  if (event.key === ' ' && !running) {
    event.preventDefault();
    startGame();
  }
}

function renderIdle(): void {
  updateStats();
  updateBest();
  const grid = document.querySelector('#answer-grid')!;
  grid.innerHTML = ['颜色', '形状', '准备', '开始'].map((label, index) => `
    <button type="button" class="answer-button idle" data-answer-index="${index}" disabled>
      <span class="answer-key">${index + 1}</span><strong>${label}</strong>
    </button>
  `).join('');
  document.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled = false;
  document.querySelector<HTMLButtonElement>('[data-action="reset"]')!.disabled = true;
  document.querySelector('#feedback')!.textContent = '答对加 10 分，答错扣 4 分。';
  document.querySelector('#stimulus-caption')!.textContent = '准备好后点击开始';
  document.querySelector('#stimulus')!.innerHTML = shapeSvg('circle', COLORS.red.hex);
  document.querySelector('#rule-text')!.textContent = '按颜色';
  document.querySelector('#rule-hint')!.textContent = '看颜色，不管形状';
  document.querySelector('#switch-count')!.textContent = '0 次';
}

function startGame(): void {
  closeOverlay();
  running = true;
  locked = false;
  timeLeft = ROUND_SECONDS;
  score = 0;
  correct = 0;
  wrong = 0;
  switches = 0;
  questionsSinceSwitch = 0;
  questionsUntilSwitch = randomSwitchLength();
  rule = Math.random() < 0.5 ? 'color' : 'shape';
  document.querySelector<HTMLButtonElement>('[data-action="start"]')!.disabled = true;
  document.querySelector<HTMLButtonElement>('[data-action="reset"]')!.disabled = false;
  document.querySelector('#feedback')!.textContent = '第一题来了，先看清规则。';
  nextQuestion();
  timer = window.setInterval(() => {
    timeLeft = Math.max(0, timeLeft - 1);
    updateStats();
    if (timeLeft <= 0) endGame();
  }, 1000);
  announce('练习开始。');
}

function debugEndNow(): void {
  running = true;
  timeLeft = 0;
  endGame();
}

function resetGame(): void {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  running = false;
  locked = false;
  round = null;
  closeOverlay();
  renderIdle();
  showToast('已回到准备状态。');
}

function nextQuestion(): void {
  if (!running) return;
  locked = false;
  if (questionsSinceSwitch >= questionsUntilSwitch) {
    rule = rule === 'color' ? 'shape' : 'color';
    switches += 1;
    questionsSinceSwitch = 0;
    questionsUntilSwitch = randomSwitchLength();
    const ruleCard = document.querySelector('#rule-card')!;
    ruleCard.classList.remove('flip');
    void (ruleCard as HTMLElement).offsetWidth;
    ruleCard.classList.add('flip');
    showToast(rule === 'color' ? '规则切换：现在按颜色。' : '规则切换：现在按形状。');
    announce(rule === 'color' ? '规则切换为按颜色。' : '规则切换为按形状。');
  }
  round = createRound(rule, Math.random, round?.stimulus);
  questionsSinceSwitch += 1;
  renderRule();
  renderStimulus();
  renderOptions();
}

function renderRule(): void {
  const card = document.querySelector('#rule-card')!;
  card.setAttribute('data-rule', rule);
  document.querySelector('#rule-text')!.textContent = rule === 'color' ? '按颜色' : '按形状';
  document.querySelector('#rule-hint')!.textContent = rule === 'color' ? '看颜色，不管形状' : '看形状，不管颜色';
}

function renderStimulus(): void {
  if (!round) return;
  const stimulus = document.querySelector('#stimulus')!;
  stimulus.innerHTML = shapeSvg(round.stimulus.shape, COLORS[round.stimulus.color].hex);
  document.querySelector('#stimulus-caption')!.textContent = rule === 'color' ? '这是什么颜色？' : '这是什么形状？';
}

function renderOptions(): void {
  if (!round) return;
  const grid = document.querySelector('#answer-grid')!;
  grid.innerHTML = round.options.map((label, index) => `
    <button type="button" class="answer-button" data-answer="${label}" data-answer-index="${index}" aria-label="选项 ${index + 1}：${label}">
      <span class="answer-key">${index + 1}</span><strong>${label}</strong>
    </button>
  `).join('');
}

function answerQuestion(answer: string): void {
  if (!running || !round || locked) return;
  locked = true;
  const result = judge(answer, round);
  if (result.correct) {
    correct += 1;
  } else {
    wrong += 1;
  }
  score = applyScore(score, result.correct);
  const feedback = document.querySelector('#feedback')!;
  feedback.classList.remove('good', 'bad');
  void (feedback as HTMLElement).offsetWidth;
  feedback.classList.add(result.correct ? 'good' : 'bad');
  feedback.innerHTML = result.correct
    ? `${icon('check')} 答对了，+10 分。`
    : `${icon('cross')} 正确答案是「${round.answer}」，-4 分。`;
  const button = document.querySelector<HTMLButtonElement>(`[data-answer="${answer}"]`);
  button?.classList.add(result.correct ? 'correct' : 'wrong');
  document.querySelector<HTMLButtonElement>(`[data-answer="${round.answer}"]`)?.classList.add('correct');
  updateStats();
  updateBear(result.correct);
  announce(result.correct ? `答对，当前 ${score} 分。` : `答错，正确答案是 ${round.answer}。`);
  window.setTimeout(nextQuestion, 420);
}

function endGame(): void {
  if (!running) return;
  running = false;
  locked = true;
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
  const summary = summarize(correct, wrong, switches, ROUND_SECONDS, score);
  let saved = null;
  try {
    const result = recordBest(localStorage.getItem(SAVE_KEY), summary);
    localStorage.setItem(SAVE_KEY, result.raw);
    saved = result.record;
  } catch {
    saved = { ...summary, at: '' };
  }
  updateStats();
  updateBest();
  updateBear(true, true);
  showEnd(summary, saved);
  announce(`时间到，得分 ${summary.score}，正确率 ${summary.accuracy}%。`);
}

function updateStats(): void {
  document.querySelector('#stat-time')!.textContent = String(timeLeft);
  document.querySelector('#stat-score')!.textContent = String(score);
  document.querySelector('#stat-correct')!.textContent = String(correct);
  document.querySelector('#switch-count')!.textContent = `${switches} 次`;
  const fill = document.querySelector<HTMLElement>('#time-fill')!;
  fill.style.width = `${(timeLeft / ROUND_SECONDS) * 100}%`;
  const track = document.querySelector('.progress-track')!;
  track.setAttribute('aria-valuenow', String(timeLeft));
}

function updateBest(): void {
  let text = '最佳：尚无记录';
  try {
    const best = parseBest(localStorage.getItem(SAVE_KEY));
    if (best) text = `最佳：${best.score} 分 · ${best.accuracy}%`;
  } catch {
    // ignored
  }
  document.querySelector('#best-pill')!.textContent = text;
}

function updateBear(lastCorrect = false, finished = false): void {
  const bubble = document.querySelector('#bear-bubble');
  if (!bubble) return;
  if (finished) {
    bubble.textContent = '时间到啦。无论分数怎样，刚才每一次辨认都算数。';
  } else if (!running) {
    bubble.textContent = '先别急着快。看清上面的规则，再看图形的颜色或形状。';
  } else if (wrong > correct && wrong > 2) {
    bubble.textContent = '错得多一点也没关系。慢半拍，先读规则牌。';
  } else if (lastCorrect) {
    bubble.textContent = '很好，就是这样。眼睛先看规则，再看图形。';
  } else {
    bubble.textContent = '切换规则的时候最容易错。深呼吸一下，再按答案。';
  }
}

function showEnd(summary: GameSummary, best: typeof summary & { at: string }): void {
  const root = document.querySelector('#end-root')!;
  root.innerHTML = `
    <div class="win-overlay">
      <section class="win-card" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <button class="win-close" type="button" data-action="overlay-close" aria-label="关闭成绩单">${icon('close')}</button>
        <div class="win-badge">${icon('timer')}</div>
        <p class="eyebrow">SIXTY SECONDS COMPLETE</p>
        <h2 id="end-title">60 秒练习结束</h2>
        <p class="win-copy">小熊把刚才的颜色和形状都收进篮子。看看自己有没有跟上规则的转换。</p>
        <div class="win-grid end-grid">
          <div><span>得分</span><strong>${summary.score}</strong></div>
          <div><span>正确率</span><strong>${summary.accuracy}%</strong></div>
          <div><span>规则切换</span><strong>${summary.switches}</strong></div>
          <div><span>答对</span><strong>${summary.correct}</strong></div>
        </div>
        <div class="win-best">${icon('spark')} 最佳成绩：${best.score} 分，正确率 ${best.accuracy}%</div>
        <div class="win-actions">
          <button class="primary-button" type="button" data-action="overlay-replay">${icon('play')} 再来 60 秒</button>
          <button class="secondary-button" type="button" data-action="overlay-close">看看页面</button>
        </div>
      </section>
    </div>
  `;
  root.querySelector<HTMLButtonElement>('.win-actions button')?.focus();
}

function closeOverlay(): void {
  document.querySelector('#end-root')!.innerHTML = '';
}

function shapeSvg(shape: string, color: string): string {
  const common = `fill="${color}" stroke="#203e34" stroke-width="2"`;
  if (shape === 'square') {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="24" y="24" width="52" height="52" rx="10" ${common}/></svg>`;
  }
  if (shape === 'triangle') {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 18 84 78H16Z" ${common} stroke-linejoin="round"/></svg>`;
  }
  if (shape === 'diamond') {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 15 84 50 50 85 16 50Z" ${common} stroke-linejoin="round"/></svg>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="30" ${common}/></svg>`;
}

function showToast(message: string): void {
  window.clearTimeout(toastTimer);
  const toast = document.querySelector<HTMLDivElement>('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2300);
}

function announce(message: string): void {
  const live = document.querySelector('#live');
  if (live) live.textContent = message;
}

renderShell();

if (new URLSearchParams(window.location.search).has('debug-end')) {
  window.setTimeout(() => {
    debugEndNow();
  }, 900);
}
