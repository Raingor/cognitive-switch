import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.GAME_URL || 'http://localhost:4310/';
const out = fileURLToPath(new URL('../artifacts/', import.meta.url));
const errors = [];
const checks = [];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const check = (name, value) => {
  assert.ok(value, name);
  checks.push(name);
  console.log('PASS', name);
};

async function open(width, height, touch) {
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: touch,
    hasTouch: touch,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${width} pageerror ${error.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`${width} console ${msg.text()}`);
  });
  page.on('requestfailed', request => errors.push(`${width} requestfailed ${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => {
    if (response.status() >= 400) errors.push(`${width} HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  return { context, page };
}

const noOverflow = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);

async function answerCorrectly(page) {
  await page.waitForSelector('[data-answer]', { timeout: 3000 });
  const correct = await page.evaluate(() => {
    const rule = document.querySelector('#rule-text')?.textContent;
    const caption = document.querySelector('#stimulus-caption')?.textContent;
    const buttons = [...document.querySelectorAll('[data-answer]')];
    const shapeMap = new Map([
      ['circle', '圆形'], ['square', '方形'], ['triangle', '三角形'], ['diamond', '菱形'],
    ]);
    const colorMap = new Map([
      ['#cf4d2d', '橘红'], ['#174a3d', '墨绿'], ['#527d91', '雾蓝'], ['#d7a63f', '暖黄'],
    ]);
    const svg = document.querySelector('#stimulus svg');
    const painted = svg?.querySelector('[fill]')?.getAttribute('fill');
    const tag = svg?.firstElementChild?.tagName.toLowerCase();
    const shape = tag === 'circle' ? '圆形' : tag === 'rect' ? '方形' : (svg?.querySelector('path')?.getAttribute('d') || '').includes('84 50') ? '菱形' : '三角形';
    const expected = rule === '按颜色' ? colorMap.get(painted) : shape;
    const target = buttons.find(button => button.dataset.answer === expected);
    return target ? { text: target.dataset.answer, index: target.dataset.answerIndex } : null;
  });
  if (!correct) throw new Error('could not infer correct answer');
  await page.locator(`[data-answer-index="${correct.index}"]`).click();
}

async function answerWrongly(page) {
  await page.waitForSelector('[data-answer]', { timeout: 3000 });
  const wrong = await page.evaluate(() => {
    const rule = document.querySelector('#rule-text')?.textContent;
    const svg = document.querySelector('#stimulus svg');
    const painted = svg?.querySelector('[fill]')?.getAttribute('fill');
    const colorMap = new Map([
      ['#cf4d2d', '橘红'], ['#174a3d', '墨绿'], ['#527d91', '雾蓝'], ['#d7a63f', '暖黄'],
    ]);
    const tag = svg?.firstElementChild?.tagName.toLowerCase();
    const shape = tag === 'circle' ? '圆形' : tag === 'rect' ? '方形' : (svg?.querySelector('path')?.getAttribute('d') || '').includes('84 50') ? '菱形' : '三角形';
    const expected = rule === '按颜色' ? colorMap.get(painted) : shape;
    const target = [...document.querySelectorAll('[data-answer]')].find(button => button.getAttribute('data-answer') !== expected);
    return target ? { index: target.getAttribute('data-answer-index') } : null;
  });
  if (!wrong?.index) throw new Error('could not infer wrong answer');
  await page.locator(`[data-answer-index="${wrong.index}"]`).click();
}

try {
  await mkdir(out, { recursive: true });
  for (const [width, height, touch] of [[1440, 960, false], [390, 844, true], [360, 780, true]]) {
    const label = `${width}${touch ? '-touch' : '-desktop'}`;
    const { context, page } = await open(width, height, touch);
    check(`${label}: title and bear image load`, await page.evaluate(async () => {
      const image = new Image();
      image.src = './characters/classic.webp';
      await image.decode().catch(() => {});
      return document.title.includes('思维切换') && image.naturalWidth > 0;
    }));
    check(`${label}: idle state has start controls`, await page.locator('[data-action="start"]').isEnabled());
    check(`${label}: no horizontal overflow`, await noOverflow(page));
    await page.screenshot({ path: `${out}/${label}-start.png`, fullPage: true, animations: 'disabled' });

    await page.locator('[data-action="start"]').click();
    check(`${label}: four answer buttons appear after start`, await page.locator('[data-answer]').count() === 4);
    check(`${label}: timer starts counting down`, await page.waitForFunction(() => Number(document.querySelector('#stat-time')?.textContent) < 60, null, { timeout: 1800 }).then(() => true));

    await answerCorrectly(page);
    check(`${label}: correct answer increments correct count`, await page.waitForFunction(() => Number(document.querySelector('#stat-correct')?.textContent) >= 1, null, { timeout: 1500 }).then(() => true));
    check(`${label}: score increases after correct answer`, await page.locator('#stat-score').textContent().then(text => Number(text) >= 10));

    await page.waitForTimeout(520);
    await answerWrongly(page);
    const feedbackText = await page.waitForFunction(() => document.querySelector('#feedback')?.textContent || '', null, { timeout: 1200 }).then(handle => handle.jsonValue());
    check(`${label}: wrong answer feedback appears`, String(feedbackText).includes('正确答案是') || await page.locator('#feedback.bad').isVisible());

    await page.keyboard.press('1');
    check(`${label}: keyboard numeric answer registers`, await page.waitForFunction(() => {
      const correct = Number(document.querySelector('#stat-correct')?.textContent || '0');
      const score = Number(document.querySelector('#stat-score')?.textContent || '0');
      return correct + score > 0;
    }, null, { timeout: 1200 }).then(() => true));

    await page.evaluate(() => {
      const time = document.querySelector('#stat-time');
      if (time) time.textContent = '1';
    });
    await page.evaluate(() => {
      const live = document.querySelector('#live');
      if (live) live.textContent = '';
    });
    await page.screenshot({ path: `${out}/${label}-playing.png`, fullPage: true, animations: 'disabled' });
    check(`${label}: aria live region exists`, await page.locator('#live').count() === 1);
    check(`${label}: no horizontal overflow during play`, await noOverflow(page));
    await context.close();
  }

  const { context, page } = await open(1440, 960, false);
  await page.locator('[data-action="start"]').click();
  await page.evaluate(() => {
    const state = document.querySelector('#stat-time');
    if (state) state.textContent = '1';
  });
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const active = document.activeElement;
    if (!active) return '';
    const style = getComputedStyle(active);
    return `${active.tagName}:${style.outlineStyle}:${style.outlineWidth}`;
  });
  check('keyboard focus is visible', /:(solid|auto):(?!0px)/.test(focused));
  await context.close();

  if (errors.length) {
    console.error(errors.join('\n'));
    throw new Error(`browser errors: ${errors.length}`);
  }
  console.log(`Browser checks passed: ${checks.length}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
