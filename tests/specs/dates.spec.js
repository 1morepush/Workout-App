// Date keys. Before v1.3 a set logged at 8:30 PM in New York was stored under
// tomorrow (UTC), and the header showed a different day than the one being logged.

const { test, expect } = require('./fixtures');

const logFirstSet = page => page.locator('.dot').first().click();
const doneKeys = page => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('wt-done') || '{}')));

// [timezone, local wall-clock moment, the local calendar date it must be filed under]
const CASES = [
  ['America/New_York',    '2026-06-15T20:30:00-04:00', '2026-06-15'],   // 00:30 UTC next day
  ['America/New_York',    '2026-06-15T23:45:00-04:00', '2026-06-15'],
  ['America/Los_Angeles', '2026-06-15T17:30:00-07:00', '2026-06-15'],   // 00:30 UTC next day
  ['Asia/Tokyo',          '2026-06-15T08:00:00+09:00', '2026-06-15'],   // 23:00 UTC previous day
];

for (const [tz, time, want] of CASES) {
  test.describe(tz, () => {
    test.use({ timezoneId: tz });
    test(`a set logged at ${time.slice(11, 16)} local is filed under ${want}`, async ({ app, page }) => {
      await app.open({ time });
      await logFirstSet(page);
      expect(await doneKeys(page)).toEqual([want]);
      expect(Object.keys(await app.storage('wt-history'))).toEqual([want]);
    });
  });
}

test('the header date is the date that gets written, for every day pill', async ({ app, page }) => {
  await app.open({ time: '2026-06-17T10:00:00-04:00' });   // a Wednesday
  const rows = await page.evaluate(() => {
    const out = [];
    for (let d = 0; d < 7; d++) {
      goDay(d);
      out.push({ pill: document.getElementById('hdrDatePill').textContent, key: viewDayStr() });
    }
    return out;
  });
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const DAY = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  for (const { pill, key } of rows) {
    const d = new Date(key + 'T12:00:00');
    expect(pill).toBe(DAY[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate());
    expect(key <= '2026-06-17', `${pill} must not point at a future date`).toBe(true);
  }
  // Tapping FRI on a Wednesday means last Friday, not the coming one.
  expect(rows[5]).toEqual({ pill: 'FRI, JUN 12', key: '2026-06-12' });
});

test('a pill still resolves correctly across the DST change', async ({ app, page }) => {
  await app.open({ time: '2026-03-09T09:00:00-04:00' });   // the Monday after US spring-forward
  const weekdays = await page.evaluate(() => [...Array(7)].map((_, d) => { goDay(d); return viewDayDate().getDay(); }));
  expect(weekdays).toEqual([0, 1, 2, 3, 4, 5, 6]);
});
