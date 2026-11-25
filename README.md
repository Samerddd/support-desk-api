# Support Desk API

A small REST API for recording support requests, assigning priority, and tracking tickets from intake to resolution. Built with Node.js and SQLite.

## Run locally

Requires Node.js 24 or newer. No packages to install.

~~~sh
npm test
npm start
~~~

The API listens at http://127.0.0.1:3000 and stores tickets in a local SQLite database.

| Method | Path | Behavior |
| --- | --- | --- |
| POST | /tickets | Create an open ticket with a title and optional priority (low, normal, high) |
| GET | /tickets | List up to 25 tickets, optionally filtered by status |
| GET | /tickets/{id} | Retrieve a ticket |
| PATCH | /tickets/{id} | Change status using a JSON body with a status field |

The list response includes nextBefore when another page exists. Pass it as the before query parameter and keep the same status filter.

~~~sh
curl -X POST http://127.0.0.1:3000/tickets -H 'Content-Type: application/json' -d '{"title":"Review invoice","priority":"high"}'
curl -X PATCH http://127.0.0.1:3000/tickets/1 -H 'Content-Type: application/json' -d '{"status":"in_progress"}'
curl 'http://127.0.0.1:3000/tickets?status=in_progress'
~~~

Tickets move from open to in_progress and then to resolved. An in-progress or resolved ticket can be reopened. Invalid transitions return HTTP 409. This demo is designed for local use.
