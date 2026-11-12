const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { load, reconcile } = require('./reconcile');

const meetings = reconcile(load('crm_events.json'), load('calendar_events.json'));
const routes = new Map([
  ['/', ['text/html', readFileSync(join(__dirname, 'public', 'index.html'))]],
  ['/app.js', ['text/javascript', readFileSync(join(__dirname, 'public', 'app.js'))]],
  ['/styles.css', ['text/css', readFileSync(join(__dirname, 'public', 'styles.css'))]],
  ['/api/meetings', ['application/json', JSON.stringify({ meetings })]],
]);

const port = Number(process.env.PORT ?? 3000);
createServer((request, response) => {
  const route = routes.get(request.url.split('?')[0]);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
  } else if (!route) {
    response.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"Route not found"}');
  } else {
    response.writeHead(200, { 'Content-Type': route[0] + '; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : route[1]);
  }
}).listen(port, '127.0.0.1', () => console.log('Event Sync at http://127.0.0.1:' + port));
