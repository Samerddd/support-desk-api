import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createDesk } from './server.mjs';

test('creates tickets, validates transitions, and filters persisted records', async (t) => {
  const server = createDesk(':memory:');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const write = (path, method, body) => fetch(base + path, { method, body: JSON.stringify(body) });

  assert.equal((await write('/tickets', 'POST', { title: ' ' })).status, 400);
  const created = await write('/tickets', 'POST', { title: 'Review invoice', priority: 'high' });
  assert.equal(created.status, 201);
  const ticket = await created.json();
  assert.equal(ticket.status, 'open');
  const path = created.headers.get('location');
  assert.deepEqual(await (await fetch(base + path)).json(), ticket);
  assert.equal((await write(path, 'PATCH', { status: 'resolved' })).status, 409);
  assert.equal((await write(path, 'PATCH', { status: 'in_progress' })).status, 200);
  assert.equal((await write(path, 'PATCH', { status: 'resolved' })).status, 200);
  const filtered = await (await fetch(base + '/tickets?status=resolved')).json();
  assert.deepEqual(filtered.tickets, [{ ...ticket, status: 'resolved' }]);
});
