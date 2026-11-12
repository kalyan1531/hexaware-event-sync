const { test } = require('node:test');
const assert = require('node:assert/strict');
const { load, reconcile, calendarTime } = require('./reconcile');
const crm = load('crm_events.json');
const calendar = load('calendar_events.json');
const meetings = reconcile(crm, calendar);
const byId = new Map(meetings.map(meeting => [meeting.id, meeting]));

test('accounts for each input exactly once, including single-source meetings', () => {
  assert.equal(meetings.length, 25);
  assert.deepEqual(meetings.flatMap(item => item.sources.crm?.id ?? []).sort(),
    crm.map(row => row.crm_id).sort());
  assert.deepEqual(meetings.flatMap(item => item.sources.calendar?.id ?? []).sort(),
    calendar.map(row => row.event_id).sort());
  assert.ok(byId.has('CRM-1003'));
  assert.ok(byId.has('CAL-A11'));
});

test('keeps the stronger Pinnacle match and preserves the other meeting and recurrence instances', () => {
  for (const id of ['CRM-1005+CAL-A5', 'CAL-A6', 'CAL-A3', 'CAL-A18']) assert.ok(byId.has(id));
});

test('shows field provenance and records conflicting locations and statuses', () => {
  const summit = byId.get('CRM-1002+CAL-A2');
  assert.equal(summit.fields.location.source, 'calendar');
  assert.ok(summit.conflicts.some(item => item.field === 'location' && item.crm.includes('NYC')));
  assert.ok(summit.conflicts.some(item => item.field === 'meeting format'));
  assert.deepEqual(byId.get('CRM-1009+CAL-A10').conflicts.find(item => item.field === 'status'),
    { field: 'status', crm: 'Cancelled', calendar: 'confirmed' });
});

test('preserves raw data while flagging repairs and filling missing values', () => {
  assert.equal(byId.get('CRM-1008+CAL-A9').sources.crm.record.meeting_date, '03-15/2025');
  assert.match(byId.get('CRM-1008+CAL-A9').sources.crm.issues[0], /Repaired/);
  assert.deepEqual(byId.get('CRM-1007+CAL-A8').fields.start,
    { value: '2025-03-18T15:00', source: 'calendar' });
  assert.match(byId.get('CRM-1015+CAL-A16').sources.calendar.issues[0], /Invalid attendee/);
});

test('converts explicit offsets to Eastern time and validates date and time components', () => {
  assert.equal(calendarTime('2025-03-13T19:00:00Z'), '2025-03-13T15:00');
  assert.equal(calendarTime('2025-03-14T20:00'), '2025-03-14T20:00');
  assert.equal(calendarTime('2025-02-30T12:00'), null);
  assert.equal(calendarTime('2025-03-14T25:00'), null);
});
