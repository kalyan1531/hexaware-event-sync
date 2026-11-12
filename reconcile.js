const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const eastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function load(name) {
  const rows = JSON.parse(readFileSync(join(__dirname, 'data', name), 'utf8'));
  if (!Array.isArray(rows)) throw new Error(name + ' must contain an array');
  return rows;
}

function normalizeText(value) {
  return String(value ?? '').toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function words(value) {
  return new Set(normalizeText(value)
    .replace(/\blpac\b/g, 'limited partner advisory committee')
    .replace(/\bqbr\b/g, 'quarterly business review')
    .replace(/\bdd\b/g, 'due diligence')
    .split(' ').filter(word => word.length > 2));
}

function sharedWords(a, b) {
  const right = words(b);
  return [...words(a)].filter(word => right.has(word)).length;
}

function dateOnly(value) {
  if (!/^\d{4}-\d\d-\d\d$/.test(value ?? '')) return null;
  const instant = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+instant) && instant.toISOString().startsWith(value) ? value : null;
}

function calendarTime(value) {
  const match = /^(\d{4}-\d\d-\d\d)T((?:[01]\d|2[0-3]):[0-5]\d)(?::[0-5]\d(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)?$/.exec(value ?? '');
  if (!match || !dateOnly(match[1])) return null;
  if (!match[3]) return match[1] + 'T' + match[2];
  const instant = new Date(value);
  if (!Number.isFinite(+instant)) return null;
  const parts = Object.fromEntries(eastern.formatToParts(instant).map(({ type, value }) => [type, value]));
  return parts.year + '-' + parts.month + '-' + parts.day + 'T' + parts.hour + ':' + parts.minute;
}

function crmRecord(row) {
  const repaired = row.meeting_date?.replace(/^(\d\d)[-/](\d\d)[-/](\d{4})$/, '$3-$1-$2');
  const date = dateOnly(repaired);
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.meeting_time ?? '') ? row.meeting_time : null;
  return {
    id: row.crm_id, raw: row, date, time,
    issues: [
      !date && 'Missing or invalid CRM date',
      date && repaired !== row.meeting_date && 'Repaired CRM date ' + row.meeting_date,
      !time && 'Missing or invalid CRM start time',
    ].filter(Boolean),
  };
}

function calendarRecord(row) {
  const start = calendarTime(row.start_time);
  const end = calendarTime(row.end_time);
  const attendees = Array.isArray(row.attendees) ? row.attendees : [];
  const emails = attendees.filter(value => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  return {
    id: row.event_id, raw: row, date: start?.slice(0, 10), time: start?.slice(11), end, emails,
    issues: [
      !start && 'Missing or invalid calendar start',
      !end && 'Missing or invalid calendar end',
      ...attendees.filter(value => !emails.includes(value)).map(value => 'Invalid attendee email: ' + value),
    ].filter(Boolean),
  };
}

function minutes(time) {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function personMatches(name, email) {
  const person = normalizeText(name).replace(/ /g, '');
  const handle = normalizeText(email?.split('@')[0]).replace(/ /g, '');
  return person.length > 0 && person === handle;
}

function candidate(crm, calendar) {
  if (!crm.date || crm.date !== calendar.date) return null;
  const client = calendar.emails.some(email => personMatches(crm.raw.client_name, email));
  const owner = personMatches(crm.raw.relationship_owner, calendar.raw.organizer);
  const title = sharedWords(crm.raw.subject, calendar.raw.title);
  const location = Boolean(crm.raw.location && normalizeText(crm.raw.location) === normalizeText(calendar.raw.location));
  const gap = crm.time && calendar.time ? Math.abs(minutes(crm.time) - minutes(calendar.time)) : null;

  // A strong client match can survive a time discrepancy. Internal meetings need
  // a close start and at least two shared title words, with an organizer or room match.
  const externalMatch = client && owner && (
    (gap !== null && gap <= 60) || (title >= 1 && (gap === null || gap <= 120))
  );
  const internalMatch = !crm.raw.client_name && gap !== null && gap <= 15 && title >= 2 && (owner || location);
  const groupMatch = normalizeText(crm.raw.client_name) === 'multiple' && owner && gap === 0 && title >= 2;
  if (!externalMatch && !internalMatch && !groupMatch) return null;

  return {
    crm, calendar,
    score: 5 * Number(client) + 2 * Number(owner) + Math.min(title, 3) +
      Number(location) + (gap === 0 ? 5 : gap !== null && gap <= 15 ? 3 : 0),
    evidence: [
      client && 'Client appears in the attendee list',
      owner && 'Relationship owner matches organizer',
      title > 0 && title + ' shared title words',
      location && 'Same location',
      gap !== null && gap + ' minutes between starts',
    ].filter(Boolean),
  };
}

function meeting(crm, calendar, match) {
  const a = crm?.raw;
  const b = calendar?.raw;
  const start = record => record?.date && record.time ? record.date + 'T' + record.time : null;
  const values = {
    title: [a?.subject, b?.title],
    date: [crm?.date, calendar?.date],
    start: [start(crm), start(calendar)],
    end: [null, calendar?.end],
    location: [a?.location, b?.location],
    status: [a?.status, b?.status],
    client: [a?.client_name, null],
    company: [a?.client_company, null],
    relationshipOwner: [a?.relationship_owner, null],
    organizer: [null, b?.organizer],
    attendees: [null, b ? calendar.emails : null],
    recurring: [null, b?.is_recurring],
    meetingType: [a?.meeting_type, null],
    crmNotes: [a?.notes, null],
    calendarDescription: [null, b?.description],
  };

  const fields = {};
  const conflicts = [];
  for (const [key, [crmValue, calendarValue]] of Object.entries(values)) {
    const source = calendarValue != null ? 'calendar' : crmValue != null ? 'crm' : null;
    fields[key] = { value: source === 'calendar' ? calendarValue : crmValue ?? null, source };
    if (crmValue != null && calendarValue != null && normalizeText(crmValue) !== normalizeText(calendarValue)) {
      conflicts.push({ field: key, crm: crmValue, calendar: calendarValue });
    }
  }
  if (a?.meeting_type?.toLowerCase() === 'in-person' && /\b(zoom|teams|virtual|meet\.google)\b/i.test(b?.location ?? '')) {
    conflicts.push({ field: 'meeting format', crm: a.meeting_type, calendar: b.location });
  }

  return {
    id: [crm?.id, calendar?.id].filter(Boolean).join('+'),
    fields, conflicts, evidence: match?.evidence ?? [],
    sources: {
      crm: crm && { id: crm.id, record: a, issues: crm.issues },
      calendar: calendar && { id: calendar.id, record: b, issues: calendar.issues },
    },
  };
}

function reconcile(crmRows, calendarRows) {
  const crm = crmRows.map(crmRecord);
  const calendar = calendarRows.map(calendarRecord);
  const candidates = crm.flatMap(left => calendar.map(right => candidate(left, right)).filter(Boolean));
  candidates.sort((a, b) => b.score - a.score);
  const usedCrm = new Set();
  const usedCalendar = new Set();
  const meetings = [];

  for (const match of candidates) {
    if (usedCrm.has(match.crm) || usedCalendar.has(match.calendar)) continue;
    const tied = candidates.some(other => other !== match && other.score === match.score &&
      (other.crm === match.crm || other.calendar === match.calendar));
    if (tied) continue;
    usedCrm.add(match.crm);
    usedCalendar.add(match.calendar);
    meetings.push(meeting(match.crm, match.calendar, match));
  }

  for (const row of crm) if (!usedCrm.has(row)) meetings.push(meeting(row, null));
  for (const row of calendar) if (!usedCalendar.has(row)) meetings.push(meeting(null, row));
  const sortKey = item => item.fields.start.value ?? item.fields.date.value ?? '~';
  return meetings.sort((a, b) => sortKey(a).localeCompare(sortKey(b)) || a.id.localeCompare(b.id));
}

module.exports = { load, reconcile, calendarTime };
