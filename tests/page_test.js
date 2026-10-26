// The REAL page (app/Index.html) in a real browser, fed by the REAL server code:
// every server call the page makes is answered by code.gs running against the test
// batch's config.gs (see harness.js). Checks that what config.gs says is what a
// student sees — names, credits, links, their section's courses — and that none of
// it is hardcoded in the page.
//
// Needs Google Chrome and `npm install` (for puppeteer-core). Without them it says so
// and passes, so `npm test` still works on a machine that only has Node.
const fs = require('fs'), path = require('path');
const { createWorld, tally, APP, FIX } = require('./harness');
const t = tally();

const CHROME = process.env.CHROME_PATH || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(p => fs.existsSync(p));
let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = null; }
if (!CHROME || !puppeteer) {
  console.log('(skipped: ' + (!CHROME ? 'Google Chrome not found — set CHROME_PATH' : 'run `npm install` first') + ')');
  console.log('\nPage test skipped');
  process.exit(0);
}

const B = 'mba26903@iimsirmaur.ac.in';
const PAGE = 'file://' + path.join(APP, 'Index.html');

// Opens the page as `email`, with google.script.run answered by code.gs in `W`.
async function open(browser, W, email) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1600 });
  page.__errs = [];
  page.on('pageerror', e => page.__errs.push(e.message));
  await page.exposeFunction('__server', (fn, args) => {
    const out = W.exec(email, c => (typeof c[fn] === 'function' ? c[fn].apply(null, args) : null));
    return JSON.stringify(out === undefined ? null : out);
  });
  await page.evaluateOnNewDocument(() => {
    const make = () => {
      const st = { s: null, f: null };
      const p = new Proxy({}, { get: (_t, k) => {
        if (k === 'withSuccessHandler') return fn => { st.s = fn; return p; };
        if (k === 'withFailureHandler') return fn => { st.f = fn; return p; };
        if (k === 'withUserObject') return () => p;
        return (...args) => {
          const s = st.s, f = st.f;
          window.__server(k, args).then(r => { const v = JSON.parse(r);
            if (v && v.threw) { if (f) f(new Error(v.threw)); } else if (s) s(v); });
        };
      } });
      return p;
    };
    window.google = { script: { get run() { return make(); }, host: { close() {} } } };
  });
  await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
  await new Promise(r => setTimeout(r, 1500));
  return page;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
  try {
    const W = createWorld();
    W.ownerFetch();

    t.section('a first-year student opening TermSync for the first time');
    let page = await open(browser, W, B);
    const text = await page.evaluate(() => document.body.innerText);
    t.ok(await page.$eval('#heroTagline', e => e.textContent) === 'IIM Sirmaur Timetable Auto-Sync Tool', 'the tagline names INSTITUTE.name');
    t.ok(await page.$eval('#heroSub', e => e.textContent.trim()) === 'Term 2 · Batch 26-28', 'the header reads "Term 2 · Batch 26-28"');
    const card = await page.$eval('#electivesBody', e => e.innerText);
    t.ok(/Your courses are already selected/.test(card) && /section B/.test(card), 'their section\'s courses are filled in for them ("section B")');
    const ticked = await page.evaluate(() => Array.from(document.querySelectorAll('input[type=checkbox]:checked')).map(c => c.value).sort());
    t.ok(ticked.join(' ') === 'ECO-B FIN-B LEAD MKT-B OPS-B STAT-B', 'and ticked: ' + ticked.join(' '));
    t.ok(!/\bTerm 5\b|\bTerm 4\b|Batch 25-27/.test(text), 'nothing on the page names another term or batch');

    t.section('credits');
    const foot = await page.evaluate(() => ({
      sac: document.getElementById('footerSacLink').getAttribute('href'),
      who: document.getElementById('footerMaintainer').textContent,
      whoUrl: document.getElementById('footerMaintainer').getAttribute('href'),
      whoShown: document.getElementById('footerMaintainerWrap').style.display !== 'none',
      creator: document.getElementById('footerCreator').innerText,
      creatorShown: document.getElementById('footerCreator').style.display !== 'none'
    }));
    t.ok(foot.sac === 'https://www.linkedin.com/company/saciimsirmaur', 'the SAC link comes from INSTITUTE.sacLinkedIn');
    t.ok(foot.whoShown && foot.who === 'Test Maintainer' && foot.whoUrl === 'https://www.linkedin.com/in/test-maintainer/',
      'the footer credits the maintainer from config.gs, with their LinkedIn');
    t.ok(foot.creatorShown && /created by Aniketh Hotagi/.test(foot.creator), 'and keeps "created by Aniketh Hotagi"');

    t.section('subject reps and course outlines come from config.gs');
    const sr = await page.evaluate(() => { openSrModal(); return document.getElementById('srContent').innerText; });
    t.ok(/Asha Example/.test(sr) || /Bimal Example/.test(sr), 'the subject-reps list shows the reps typed into config.gs');
    const co = await page.evaluate(() => { openCoModal(); return document.getElementById('coContent').innerHTML; });
    t.ok(/drive\.google\.com\/file\/d\/TESTFILEIDECO0123456789\/view/.test(co), 'the ECO outline links to its Drive file');
    t.ok(/drive\.google\.com\/drive\/folders\/TESTFOLDERID0123456789/.test(co), 'and the folder link is there');

    t.section('a course added to their section after they enabled');
    W.USER_PROPS[B].tt_electives_drift = JSON.stringify({ added: ['TOUR'], removed: [] });
    page = await open(browser, W, B);
    const drift = await page.evaluate(() => ({ title: document.getElementById('driftTitle').textContent,
      btn: document.getElementById('btnTakeDrift').textContent, shown: document.getElementById('driftCard').style.display !== 'none' }));
    t.ok(drift.shown && drift.title === "Your section's courses have changed" && drift.btn === "Use my section's courses",
      'the card speaks about their section, not an elective list ("' + drift.title + '")');
    delete W.USER_PROPS[B].tt_electives_drift;

    t.section('the maintainer');
    page = await open(browser, W, W.owner);
    const badge = await page.$eval('#specialBadge', e => ({ text: e.textContent.trim(), shown: e.style.display !== 'none' }));
    t.ok(badge.shown && /✦ Maintainer/.test(badge.text), 'gets the ✦ Maintainer badge (got "' + badge.text + '")');

    t.section('"pick" mode');
    const Wp = createWorld({ config: fs.readFileSync(path.join(FIX, 'test.config.gs'), 'utf8')
      .replace('number: 2,', 'number: 2,\n  courseSelection: "pick",') });
    Wp.ownerFetch();
    page = await open(browser, Wp, B);
    const pick = await page.evaluate(() => ({
      card: document.getElementById('electivesCard').style.display,
      btn: document.getElementById('btnFetchElectives').style.display,
      ticked: document.querySelectorAll('input[type=checkbox]:checked').length
    }));
    t.ok(pick.card === 'none' && pick.btn === 'none' && pick.ticked === 0, 'nothing is filled in, and no Auto-fill button is offered');

    t.ok(!page.__errs.length, 'no script errors' + (page.__errs.length ? ': ' + page.__errs.join(' | ') : ''));

    t.section('features switched off in config.gs');
    const Wo = createWorld({ config: fs.readFileSync(path.join(FIX, 'test.config.gs'), 'utf8') +
      '\nvar FEATURES = { adminDashboard: false, usageStats: false, subjectReps: false, courseOutlines: false, ' +
      'pdfDownload: false, reportWrongEntry: false };\n' });
    Wo.ownerFetch();
    const sac = 'mba26902@iimsirmaur.ac.in';
    const rr = Wo.exec(sac, c => c.getMyElectives());
    Wo.exec(sac, c => c.enableAutoSync(rr.electives.map(e => e.section ? e.code + '-' + e.section : e.code), {}, 'x'));
    page = await open(browser, Wo, sac);
    const vis = await page.evaluate(() => {
      const shown = el => !!el && el.getClientRects().length > 0;
      const byText = t => Array.from(document.querySelectorAll('.footer button')).find(b => b.textContent.trim() === t);
      return { reps: shown(byText('subject reps')), outlines: shown(byText('course outlines')), stats: shown(byText('stats')),
               pdf: shown(document.getElementById('pdfCard')), report: shown(document.querySelector('.report-link')),
               admin: shown(document.getElementById('adminDash')), credit: shown(document.getElementById('footerCreator')) };
    });
    t.ok(!vis.reps && !vis.outlines && !vis.stats, 'the subject reps, course outlines and stats links are gone');
    t.ok(!vis.pdf && !vis.report, 'so are Download PDF and Report a wrong entry');
    t.ok(!vis.admin, 'and a SAC member sees no admin panel');
    t.ok(vis.credit, 'the credits stay');
  } finally {
    await browser.close();
  }
  t.done('Page verified');
})().catch(e => { console.error(e); process.exit(1); });
