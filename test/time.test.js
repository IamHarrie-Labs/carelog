import test from 'node:test';
import assert from 'node:assert/strict';
import { localInputToIso, fmtDateTime } from '../public/ui.js';

test('form times are read in the circle timezone, whatever the browser timezone is', () => {
  assert.equal(localInputToIso('2026-10-19T14:00', 'Africa/Lagos'), '2026-10-19T13:00:00.000Z');
  assert.equal(localInputToIso('2026-07-01T09:30', 'America/New_York'), '2026-07-01T13:30:00.000Z');
  assert.equal(localInputToIso('2026-12-01T09:30', 'America/New_York'), '2026-12-01T14:30:00.000Z');
  assert.equal(localInputToIso('2026-03-29T03:00', 'Europe/London'), '2026-03-29T02:00:00.000Z'); // just after clocks go forward
  assert.equal(localInputToIso('', 'Europe/London'), undefined);
});

test('a saved shift shows the same times that were typed', () => {
  for (const tz of ['Africa/Lagos', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC']) {
    const shown = fmtDateTime(localInputToIso('2026-10-19T14:00', tz), tz);
    assert.match(shown, /14:00/, `${tz}: ${shown}`);
  }
});
