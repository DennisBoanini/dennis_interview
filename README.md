# Chat Log Exercise

A small monorepo containing a Java backend and a React frontend. The goal is to load a
supplied set of users and direct messages, serve them from a real API in chronological
order, accept new messages in memory, and render the chat log responsively.

```
treatwell-interview-test/
├── backend/    # Java, Maven
└── frontend/   # React 18, TypeScript, Vite
```

## Prerequisites

- **Java 25**
- **Node.js 22+** and **Yarn**

## Getting Started

### Backend

```bash
cd backend
./mvnw spring-boot:run
```

The API starts at `http://localhost:8080`.

Run the backend tests with `./mvnw test`.

### Frontend

The project pins its Yarn version to 1.22.19 via `packageManager` in `frontend/package.json`.

```bash
cd frontend
yarn install
yarn dev
```

The app starts at `http://localhost:5173`.

## The Data

Two fixture files describe the raw data the backend should load on startup:

- `backend/src/main/resources/data/users.json` — a list of users, each with integer `id`, `firstName`, `lastName`, `email`, `avatarUrl`
- `backend/src/main/resources/data/messages.json` — a list of direct messages, each with integer `id`, integer `userId` (references a user),
  `message` (an array of message lines), and `timestamp`

Assume:

- There could be any number of users in `users.json` and messages in `messages.json` (only a couple are included here).
- The users and messages data always contain the fields shown above, there are no optional
  properties.

## API Contract

### Get chat log

```http
GET /api/chat-log
```

Returns all messages, enriched with their sender's details, in ascending chronological
order (oldest message first).

On success, the endpoint must return `200 OK` with a JSON response (`Content-Type:
application/json`) matching the shape below. If there are no messages, it must return
`200 OK` with an empty array (`[]`). If two messages have the same timestamp, their
relative order is not specified.

This HTTP contract is fixed so that the frontend and automated checks can interact with
the backend. The internal Java design is up to you; no controller, service, or method
signature is prescribed.

**Response `200`**

```json
[
  {
    "messageId": 9,
    "userId": 4,
    "message": ["Oldest message"],
    "timestamp": "2016-03-19T04:36:05Z",
    "email": "hhawkins1@posterous.com",
    "fullName": "Helen Hawkins",
    "avatarUrl": "https://via.placeholder.com/80x80/9317a3/ffffff.png"
  }
]
```

### Create a message

```http
POST /api/messages
Content-Type: application/json
```

Creates a message for an existing user. The request contains the sender's integer ID and
one or more message lines:

```json
{
  "userId": 4,
  "message": ["A new message", "A second paragraph"]
}
```

The backend must:

- generate a positive, increasing integer `messageId` greater than the IDs already loaded;
- generate the message timestamp on the server;
- retain the new message in memory for the lifetime of the application; and
- include it in subsequent `GET /api/chat-log` responses in chronological order.

In-memory state may reset when the application restarts. Choose a sensible response for
invalid input, including an unknown `userId`, and document that decision.

On success, return `201 Created` with a JSON response matching a single entry from the
chat-log response:

```json
{
  "messageId": 11,
  "userId": 4,
  "message": ["A new message", "A second paragraph"],
  "timestamp": "2026-08-07T09:00:00Z",
  "email": "hhawkins1@posterous.com",
  "fullName": "Helen Hawkins",
  "avatarUrl": "https://via.placeholder.com/80x80/9317a3/ffffff.png"
}
```

## The Challenge

### Task 1 — Backend: load, join, create, and serve

Implement the backend so that it loads `users.json` and `messages.json` on startup and
exposes `GET /api/chat-log` matching the contract above — messages joined with their
sender's details, sorted in ascending order by `timestamp`. Implement `POST /api/messages`
so valid new messages receive server-generated IDs and timestamps, are retained in memory,
and appear in later chat-log responses.

### Task 2 — Frontend: fetch and render

Wire up the `ChatLog` component to fetch from `GET /api/chat-log` using the `getChatLog` function and render the conversation. Match the layout shown in `frontend/design/`:

- `desktop-design.png` — viewport wider than 450px
- `mobile-design.png` — viewport at 450px or narrower

Should take into account:

- Choosing a sensible policy for a message whose `userId` doesn't match any user, and
  documenting that decision
- The potential number of messages and users
- Accessibility - correct semantic HTML; screen reader compatibility
- Using CSS Modules for the layout

The frontend remains read-only for this exercise; a message composer is not required.

### Task 3 — Loading, empty, and error states

The UI should clearly communicate all of the following states to the user:

- **Loading** — while the request is in flight
- **Empty** — the request succeeds but there are no messages
- **Error** — the request fails

### Task 4 — Tests

Add tests on both sides where you think they add the most value.

- We care more about _what_ you chose to test and _why_ than raw coverage.
- Test at whatever level feels appropriate (unit, integration, or component tests).
- Be ready to talk through your testing choices and any trade-offs in the follow-up interview.

## AI Usage

Usage of AI tools is fine. If you use AI, we're interested in _how_ you collaborated with
it: the prompts, where it influenced your design or implementation decisions, and where
you accepted, rejected, or adapted its suggestions. We'll ask about these decisions in the
follow-up interview, so make sure you understand the approach taken, even where AI assisted.

## Evaluation Criteria

| Area          | What we look at                                                          |
| ------------- | ------------------------------------------------------------------------ |
| Correctness   | Do the endpoints join, sort, and create correctly? Does the UI render the real data? |
| Code quality  | Clean, idiomatic Java/TypeScript; no unnecessary abstractions            |
| UX            | Sensible loading/empty/error handling; responsive layout                 |
| Accessibility | Correct semantic HTML; screen reader compatibility                       |
| Testing       | Meaningful tests, sensible choice of what to cover                       |
| Communication | Clear reasoning behind your approach and trade-offs                      |

## Tech Stack

### Backend

- Java 25
- Spring Boot 4.1
- Maven Wrapper

### Frontend

- React 18
- TypeScript
- Vite
- CSS Modules
- Node 22+
- Yarn
