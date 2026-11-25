import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const transitions = {
  open: ['in_progress'],
  in_progress: ['resolved', 'open'],
  resolved: ['open'],
};

function send(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes <= 8192) chunks.push(chunk);
  }
  if (bytes > 8192) throw Object.assign(new Error('Body exceeds 8 KiB'), { status: 413 });
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SyntaxError();
  return body;
}

export function createDesk(databasePath = 'tickets.db') {
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      priority TEXT NOT NULL CHECK (priority IN ('low', 'normal', 'high')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved'))
    );
  `);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const { pathname, searchParams } = url;
      const match = /^\/tickets\/(\d+)$/.exec(pathname);

      if (request.method === 'GET' && pathname === '/tickets') {
        const status = searchParams.get('status');
        const before = searchParams.get('before');
        if (status !== null && !Object.hasOwn(transitions, status)) {
          return send(response, 400, { error: 'Invalid status' });
        }
        if (before !== null && (!/^\d+$/.test(before) || !Number.isSafeInteger(Number(before)))) {
          return send(response, 400, { error: 'Invalid cursor' });
        }
        const cursor = before === null ? null : Number(before);
        const rows = db.prepare(`
          SELECT * FROM tickets WHERE (? IS NULL OR status = ?) AND (? IS NULL OR id < ?)
          ORDER BY id DESC LIMIT 26
        `).all(status, status, cursor, cursor);
        const tickets = rows.slice(0, 25);
        return send(response, 200, { tickets, nextBefore: rows.length > 25 ? tickets.at(-1).id : null });
      }

      if (request.method === 'POST' && pathname === '/tickets') {
        const { title, priority = 'normal' } = await readBody(request);
        if (typeof title !== 'string' || !title.trim() || title.trim().length > 120 ||
            !['low', 'normal', 'high'].includes(priority)) {
          return send(response, 400, { error: 'Provide a title of 1–120 characters and a valid priority' });
        }
        const ticket = db.prepare('INSERT INTO tickets (title, priority) VALUES (?, ?) RETURNING *')
          .get(title.trim(), priority);
        response.setHeader('Location', '/tickets/' + ticket.id);
        return send(response, 201, ticket);
      }

      if (match && ['GET', 'PATCH'].includes(request.method)) {
        const id = Number(match[1]);
        const input = request.method === 'PATCH' ? await readBody(request) : null;
        const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
        if (!ticket) return send(response, 404, { error: 'Ticket not found' });
        if (!input) return send(response, 200, ticket);
        if (typeof input.status !== 'string' || !Object.hasOwn(transitions, input.status)) {
          return send(response, 400, { error: 'Invalid status' });
        }
        if (!transitions[ticket.status].includes(input.status)) {
          return send(response, 409, { error: 'Invalid status transition' });
        }
        const updated = db.prepare('UPDATE tickets SET status = ? WHERE id = ? AND status = ? RETURNING *')
          .get(input.status, id, ticket.status);
        return updated
          ? send(response, 200, updated)
          : send(response, 409, { error: 'Ticket status changed. Reload and retry.' });
      }

      return send(response, 404, { error: 'Route not found' });
    } catch (error) {
      if (error instanceof SyntaxError) return send(response, 400, { error: 'Expected a JSON object' });
      if (error.status === 413) return send(response, 413, { error: error.message });
      return send(response, 500, { error: 'Unexpected server error' });
    }
  });
  server.once('close', () => db.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createDesk().listen(3000, '127.0.0.1', () => console.log('Listening on http://127.0.0.1:3000'));
}
