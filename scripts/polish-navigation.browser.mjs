import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const base = process.env.BASE_URL || 'http://localhost:4099/';
const artifacts = process.env.NAV_ARTIFACTS || '/root/pactra-nav-artifacts';
const destinations = {
  Workspace: '/tasks',
  'New agreement': '/tasks/new',
  'JSON checker': '/checker',
  'Clear agreements': '/#principles',
  'Human decisions': '/#principles',
  'Release boundaries': '/#release',
  'The Pactra story': '/journal/introducing-pactra',
  'How it works': '/#capabilities',
  'Review the evidence': '/checker',
  'Development docs': 'https://github.com/zDarkx1/Pactra/tree/main/docs',
};
export async function withPage(viewport, reducedMotion, run) {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/root/ui-research/node_modules/playwright/index.mjs');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport, reducedMotion });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.getByRole('link', { name: 'Pactra home', exact: true }).waitFor();
    await run(page);
    assert.deepEqual(errors, [], 'No browser runtime errors');
  } finally { await browser.close(); }
}
async function eventually(check, message) {
  let error;
  for (let i = 0; i < 50; i++) {
    try { await check(); return; } catch (e) { error = e; }
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  throw new Error(message, { cause: error });
}
async function noOverflow(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow');
}
async function screenshot(page, name) {
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: `${artifacts}/${name}.png` });
}
async function unlocked(page) {
  await eventually(async () => assert.equal(await page.evaluate(() => document.body.hasAttribute('data-scroll-locked')), false), 'Radix scroll lock released');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), 'hidden');
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).pointerEvents), 'none');
}
async function anchorLanded(page, id) {
  await eventually(async () => {
    assert.equal(new URL(page.url()).hash, `#${id}`);
    const box = await page.locator(`#${id}`).boundingBox();
    const header = await page.locator('header').boundingBox();
    assert.ok(box.y >= header.height - 2 && box.y < 180, `Anchor ${id} visible below header, y=${box.y}`);
  }, `Anchor ${id} lands without a focus jump`);
  const settled = await page.evaluate(() => scrollY);
  await page.waitForTimeout(400);
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - settled) < 3, 'No delayed scroll restoration jump');
}
export async function mobileNavigation(width = 390, reducedMotion = 'reduce') {
  await withPage({ width, height: 844 }, reducedMotion, async page => {
    const trigger = page.getByRole('button', { name: 'Open navigation', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Main navigation', exact: true });
    const close = page.getByRole('button', { name: 'Close navigation', exact: true });
    // Click the visible sticky control as a user does; locator.click first calls
    // scrollIntoView, which can scroll a sticky element's original layout box.
    const openDrawer = async () => {
      const box = await trigger.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await dialog.waitFor();
    };
    const triggerBox = await trigger.boundingBox();
    const logoBox = await page.getByRole('link', { name: 'Pactra home', exact: true }).boundingBox();
    assert.ok(triggerBox.width >= 44 && triggerBox.height >= 44);
    assert.ok(logoBox.x + logoBox.width < triggerBox.x, 'Logo and control do not overlap');
    await screenshot(page, `mobile${width}-closed-${reducedMotion}`);
    await page.evaluate(() => scrollTo({ top: 550, behavior: 'instant' }));
    const start = await page.evaluate(() => scrollY);

    for (const method of ['close', 'escape', 'backdrop', 'close']) {
      await openDrawer();
      await dialog.waitFor();

      assert.ok(await dialog.getAttribute('aria-describedby'), 'Dialog has an accessible description');
      assert.ok(await dialog.getAttribute('aria-labelledby'), 'Dialog has an accessible title');
      const closeBox = await close.boundingBox();
      assert.ok(closeBox.width >= 44 && closeBox.height >= 44);
      const bounds = await dialog.boundingBox();
      assert.ok(bounds.height >= 842, 'Drawer fills the viewport height');
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press(i < 6 ? 'Tab' : 'Shift+Tab');
        assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Focus stays inside dialog');
      }
      await dialog.getByRole('link', { name: 'Try the checker', exact: true }).focus();
      await page.keyboard.press('Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Tab wraps at end');
      await dialog.getByRole('link', { name: 'Pactra home', exact: true }).focus();
      await page.keyboard.press('Shift+Tab');
      assert.ok(await dialog.evaluate(el => el.contains(document.activeElement)), 'Shift+Tab wraps at start');
      for (const group of ['Product', 'Principles', 'Learn']) await dialog.getByRole('button', { name: group, exact: true }).click();
      for (const [name, href] of Object.entries(destinations)) {
        assert.equal(await dialog.getByRole('link', { name, exact: true }).getAttribute('href'), href, `Preserved destination: ${name}`);
      }
      for (const link of await dialog.getByRole('link').all()) {
        const box = await link.boundingBox();
        if (box) assert.ok(box.height >= 44, `44px link: ${await link.textContent()}`);
      }
      await noOverflow(page);
      assert.ok(await dialog.evaluate(el => el.scrollHeight > el.clientHeight), 'Expanded drawer scrolls independently');
      await dialog.getByRole('link', { name: 'Try the checker', exact: true }).scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => scrollY), start, 'Drawer scrolling leaves page unchanged');
      if (method === 'close') await close.click();
      if (method === 'escape') await page.keyboard.press('Escape');
      if (method === 'backdrop') await page.mouse.click(4, 400);
      await dialog.waitFor({ state: 'hidden' });
      await unlocked(page);
      await eventually(async () => assert.ok(await trigger.evaluate(el => el === document.activeElement)), 'Dismissal restores trigger focus');
      assert.ok(Math.abs(await page.evaluate(() => scrollY) - start) < 3, 'Repeated dismissal preserves original page scroll');
    }
    await openDrawer();
    await dialog.getByRole('button', { name: 'Principles', exact: true }).click();
    await screenshot(page, `mobile${width}-open-${reducedMotion}`);
    await dialog.getByRole('link', { name: 'Clear agreements', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await unlocked(page);
    await anchorLanded(page, 'principles');
    await openDrawer();
    await dialog.getByRole('button', { name: 'Learn', exact: true }).click();
    await dialog.getByRole('link', { name: 'How it works', exact: true }).click();
    await anchorLanded(page, 'capabilities');
    await openDrawer();
    await dialog.getByRole('link', { name: 'Updates', exact: true }).click();
    await anchorLanded(page, 'release');
    await openDrawer();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await dialog.waitFor({ state: 'hidden' });
    await unlocked(page);
    assert.ok(await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.getBoundingClientRect().width > 0), 'Breakpoint cleanup leaves focus on a visible element');
    await page.setViewportSize({ width, height: 844 });
    await openDrawer();
    assert.equal(await dialog.getByRole('link', { name: 'Open workspace', exact: true }).getAttribute('href'), '/tasks');
    assert.equal(await dialog.getByRole('link', { name: 'Try the checker', exact: true }).getAttribute('href'), '/checker');
    await dialog.getByRole('link', { name: 'Try the checker', exact: true }).click();
    await page.waitForURL('**/checker');
    await dialog.waitFor({ state: 'hidden' });
    await unlocked(page);
    await noOverflow(page);
  });
}
export async function desktopNavigation() {
  await withPage({ width: 1440, height: 1000 }, 'no-preference', async page => {
    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    const product = nav.getByRole('button', { name: 'Product', exact: true });
    await product.hover();
    const panel = page.locator('[data-mega-panel]:visible');
    await panel.waitFor();
    const bounds = await panel.boundingBox();
    assert.ok(bounds.width >= 1438 && bounds.x <= 1, `Creative mega menu spans viewport: ${JSON.stringify(bounds)}`);
    const link = panel.getByRole('link', { name: /Workspace/ }).first();
    const target = await link.boundingBox();
    await page.mouse.move(target.x + 20, target.y + 20, { steps: 16 });
    await page.waitForTimeout(250);
    assert.ok(await panel.isVisible(), 'Pointer transit keeps menu open');
    await screenshot(page, 'desktop1440-mega');
    await link.focus();
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    assert.ok(await product.evaluate(el => el === document.activeElement), 'Escape restores trigger');
    await page.keyboard.press('Enter');
    await panel.waitFor();
    await page.keyboard.press('ArrowDown');
    assert.ok(await panel.evaluate(el => el.contains(document.activeElement)), 'ArrowDown enters links');
    await page.mouse.click(10, 700);
    await panel.waitFor({ state: 'hidden' });
    await nav.getByRole('button', { name: 'Principles', exact: true }).focus();
    await page.keyboard.press('Enter');
    await panel.getByRole('link', { name: /Clear agreements/ }).waitFor();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => document.activeElement?.getAttribute('href') === '/#principles'), 'Keyboard enters Principles links and stays there after pointer-leave delay');
    await page.keyboard.press('Enter');
    await panel.waitFor({ state: 'hidden' });
    await anchorLanded(page, 'principles');
    await nav.getByRole('link', { name: 'Updates', exact: true }).click();
    await anchorLanded(page, 'release');
    const scrolled = await page.evaluate(() => scrollY);
    const triggerBox = await product.boundingBox();
    await page.mouse.move(triggerBox.x + 20, triggerBox.y + 20);
    await panel.getByRole('link', { name: /Workspace/ }).first().waitFor();
    await panel.getByRole('link', { name: /Workspace/ }).first().evaluate(el => el.focus({ preventScroll: true }));
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => scrollY), scrolled, 'Escape from scrolled mega menu does not jump');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    for (const group of ['Product', 'Principles', 'Learn']) {
      await nav.getByRole('button', { name: group, exact: true }).focus();
      await page.keyboard.press('Enter');
      await panel.waitFor();
      for (const anchor of await panel.getByRole('link').all()) {
        const text = await anchor.textContent();
        const name = Object.keys(destinations).find(name => text.startsWith(name));
        assert.equal(await anchor.getAttribute('href'), name ? destinations[name] : '/journal/introducing-pactra');
      }
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
    }
    await product.focus();
    await page.keyboard.press('Enter');
    await panel.waitFor();
    await page.getByRole('link', { name: 'Pactra home', exact: true }).focus();
    await panel.waitFor({ state: 'hidden' });
    await page.mouse.move(10, 700);
    await product.hover();
    await panel.waitFor();
    const toggle = await product.boundingBox();
    await page.mouse.click(toggle.x + 20, toggle.y + 20);
    await panel.waitFor({ state: 'hidden' });
    await page.mouse.click(toggle.x + 20, toggle.y + 20);
    await panel.waitFor();
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1024, height: 768 });
    const logo = await page.getByRole('link', { name: 'Pactra home', exact: true }).boundingBox();
    const menu = await nav.boundingBox();
    assert.ok(logo.x + logo.width < menu.x, 'Desktop breakpoint leaves logo clear of navigation');
    await noOverflow(page);
    assert.equal(await page.locator('header .pin-spacer').count(), 0, 'Navigation adds no GSAP pin');
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [name, run] of [
    ['mobile390 reduced motion', () => mobileNavigation(390)],
    ['mobile320 normal motion', () => mobileNavigation(320, 'no-preference')],
    ['desktop1440', desktopNavigation],
  ]) {
    await run();
    console.log(`PASS ${name}`);
  }
  console.log(`Screenshots: ${artifacts}`);
}
