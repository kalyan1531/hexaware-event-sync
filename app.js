const list = document.querySelector('#meetings');
const status = document.querySelector('#status');
const conflictsOnly = document.querySelector('#conflicts');

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function display(value) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ') || 'None';
  return String(value);
}

function label(field) {
  return field.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
}

function renderMeeting(meeting) {
  const details = element('details');
  const { fields, sources, conflicts, evidence } = meeting;
  const summary = element('summary');
  summary.append(
    element('strong', fields.title.value ?? 'Untitled meeting'),
    element('span', (fields.start.value?.replace('T', ' ') ?? fields.date.value ?? 'Date unknown') +
      ' · ' + Object.entries(sources).filter(([, value]) => value).map(([key]) => key === 'crm' ? 'CRM' : 'Calendar').join(' + ') +
      (conflicts.length ? ' · ' + conflicts.length + ' differences' : ''))
  );
  details.append(summary);

  if (conflicts.length) {
    details.append(element('h2', 'Source differences'));
    const table = element('table');
    const header = element('tr');
    for (const title of ['Field', 'CRM', 'Calendar']) header.append(element('th', title));
    const head = element('thead');
    head.append(header);
    const body = element('tbody');
    for (const conflict of conflicts) {
      const row = element('tr');
      for (const value of [label(conflict.field), conflict.crm, conflict.calendar]) row.append(element('td', display(value)));
      body.append(row);
    }
    table.append(head, body);
    details.append(table);
  }

  details.append(element('h2', 'Unified fields'));
  const values = element('dl');
  for (const [key, { value, source }] of Object.entries(fields)) {
    if (value == null) continue;
    values.append(element('dt', label(key)), element('dd', display(value) + ' · ' + (source === 'crm' ? 'CRM' : 'Calendar')));
  }
  details.append(values);

  if (evidence.length) details.append(element('p', 'Match evidence — ' + evidence.join(', ')));
  for (const [key, source] of Object.entries(sources)) {
    if (!source) continue;
    const original = element('details');
    original.append(element('summary', (key === 'crm' ? 'CRM' : 'Calendar') + ' record · ' + source.id));
    for (const issue of source.issues) original.append(element('p', issue));
    original.append(element('pre', JSON.stringify(source.record, null, 2)));
    details.append(original);
  }
  return details;
}

async function init() {
  try {
    const response = await fetch('./meetings.json');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const { meetings } = await response.json();
    function render() {
      const visible = conflictsOnly.checked ? meetings.filter(item => item.conflicts.length) : meetings;
      status.textContent = visible.length + ' of ' + meetings.length + ' meetings · Times shown in US Eastern time';
      list.replaceChildren(...visible.map(renderMeeting));
    }
    conflictsOnly.addEventListener('change', render);
    render();
  } catch (error) {
    status.textContent = 'Could not load meetings. ' + error.message;
  }
}
init();

