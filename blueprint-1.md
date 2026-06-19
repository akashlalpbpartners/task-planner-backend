# task-planner-backend — Blueprint

> **One-line summary:** A REST API that stores and manages user tasks in MySQL for the Task Planner app.

---

## 1. Project Identity

| Field            | Value |
|------------------|-------|
| Repo name        | `task-planner-backend` |
| Type             | Backend |
| Primary language | JavaScript (Node.js) |
| Runtime / engine | Node.js |
| Package manager  | npm |
| Entry point      | `server.js` |
| Exposed ports    | `8002` (default, configurable via `PORT`) |
| Current version  | `1.0.0` (from `package.json`) |

---

## 2. Business Purpose  <!-- VECTOR CHUNK: purpose -->

The Task Planner backend solves the problem of reliably storing and retrieving personal or team tasks outside the browser. It gives the Task Planner frontend a single source of truth for task data so users can create tasks, update their progress, set priorities and due dates, and delete completed or cancelled work. Anyone using the Task Planner web app depends on this service to keep their task list consistent across page refreshes and sessions. The key outcome is durable task management: every create, edit, and delete action is saved to a MySQL database and immediately available to all clients that call the API.

---

## 3. Tech Stack

| Layer          | Technology | Version | Notes |
|----------------|------------|---------|-------|
| Framework      | Express    | ^4.21.2 | HTTP server and routing |
| Language       | JavaScript | ES2020+ (Node.js) | CommonJS modules |
| Database       | MySQL      | unknown | External; schema created manually |
| ORM / Query    | mysql2     | ^3.14.1 | Raw parameterized SQL via connection pool |
| Auth           | none       | —       | <!-- TODO: not found in codebase --> No authentication or authorization |
| Infra / Deploy | unknown    | —       | <!-- TODO: not found in codebase --> No Docker, CI, or deploy config |
| Key libraries  | express, mysql2, cors, dotenv, crypto (built-in) | — | Top 5 runtime dependencies |

---

## 4. Repository Structure

```
task-planner-backend/
├── server.js          # Express app, validation, API routes, server startup
├── db.js              # MySQL connection pool configuration
├── package.json       # Project metadata, dependencies, start script
├── tasks.json         # Legacy JSON file; no longer read by server.js
├── .env               # Local secrets and config (gitignored)
├── .env.example       # Environment variable template (gitignored)
├── .gitignore         # Ignores node_modules, .env, package-lock.json, etc.
├── README.md          # Human-readable setup and API documentation
└── blueprint.md       # Earlier blueprint document
```

> `node_modules/` and `package-lock.json` exist locally after `npm install` but are gitignored.

---

## 5. Modules  <!-- PRIMARY VECTOR CHUNK SOURCE -->

### 5.1  Database Connection Pool
<!-- VECTOR CHUNK: module:database-connection-pool -->

| Field          | Detail |
|----------------|--------|
| Location       | `db.js` |
| Type           | Service / Infrastructure |
| Depends on     | `mysql2/promise`, environment variables (`DB_HOST`, `DB_POD_PORT`, `DB_POD_USERNAME`, `DB_POD_PASSWORD`, `DB_DATABASE`) |
| Exposes        | MySQL connection `pool` (default export) |

**What it does (product view)**

This module is the bridge between the Task Planner app and the database where tasks live. It keeps a ready pool of database connections so the API can quickly save new tasks, load the full task list, apply updates, and process deletions without opening a new connection on every request.

**What it does (engineering view)**

`db.js` creates a `mysql2/promise` connection pool with `waitForConnections: true` and `connectionLimit: 10`. Host, port, user, password, and database name are read from environment variables at process start. Port defaults to `3306` if `DB_POD_PORT` is missing or non-numeric. The pool is exported as the sole module export and imported by `server.js` for all SQL operations. There is no connection retry logic, health-check wrapper, or graceful shutdown handler beyond process exit.

**Key files**

| File | Responsibility |
|------|---------------|
| `db.js` | Instantiate and export MySQL connection pool |

**API surface / Public interface**

```javascript
const pool = require("./db");
await pool.execute(sql, params);
await pool.query(sql);
```

**Data model / Schema** (if applicable)

N/A — this module does not define schema; it only provides connectivity.

---

### 5.2  Task Payload Validation
<!-- VECTOR CHUNK: module:task-payload-validation -->

| Field          | Detail |
|----------------|--------|
| Location       | `server.js` (functions `isValidPriority`, `isValidStatus`, `normalizeTaskPayload`) |
| Type           | Utility |
| Depends on     | Incoming HTTP request JSON body |
| Exposes        | `normalizeTaskPayload(body)` → `{ task }` or `{ error }` |

**What it does (product view)**

Before any task is saved or updated, this logic checks that the information makes sense — for example, that a title was provided, that priority is Low, Medium, or High, and that status is To Do, In Progress, or Done. It protects users from accidentally saving incomplete or invalid task data and returns clear error messages when something is wrong.

**What it does (engineering view)**

`normalizeTaskPayload` destructures `title`, `description`, `priority`, `status`, and `due_date` from the request body. Title must be a non-empty trimmed string. Description must be a string if present. Priority and status are validated against fixed allowlists via helper functions. `due_date` must be a string if provided. On success it returns a normalized `task` object with defaults: empty description, `Medium` priority, `To Do` status, and current ISO timestamp for missing `due_date`. Validation errors return `{ error: "..." }` with HTTP 400 applied by route handlers. There is no schema library (e.g. Zod); validation is manual.

**Key files**

| File | Responsibility |
|------|---------------|
| `server.js` | Contains all validation and normalization functions |

**API surface / Public interface**

```javascript
normalizeTaskPayload(body) → { task: TaskFields } | { error: string }
isValidPriority(priority) → boolean
isValidStatus(status) → boolean
```

**Data model / Schema** (if applicable)

Normalized task fields (before ID assignment):

| Field         | Type   | Default              | Allowed values |
|---------------|--------|----------------------|----------------|
| `title`       | string | — (required)         | non-empty trimmed |
| `description` | string | `""`                 | any string |
| `priority`    | string | `"Medium"`           | `Low`, `Medium`, `High` |
| `status`      | string | `"To Do"`            | `To Do`, `In Progress`, `Done` |
| `due_date`    | string | current ISO datetime | ISO 8601 string |

---

### 5.3  Task Serialization Helpers
<!-- VECTOR CHUNK: module:task-serialization -->

| Field          | Detail |
|----------------|--------|
| Location       | `server.js` (functions `formatTask`, `toMySQLDateTime`) |
| Type           | Utility |
| Depends on     | MySQL row shape, JavaScript `Date` |
| Exposes        | `formatTask(row)`, `toMySQLDateTime(isoString)` |

**What it does (product view)**

These helpers translate task data between the format stored in the database and the format the web app expects. Users always see due dates and task details in a consistent structure when loading or deleting tasks, regardless of how MySQL internally stores datetime values.

**What it does (engineering view)**

`formatTask` maps a MySQL result row to the API contract: coalesces null `description` to `""`, converts `due_date` to ISO 8601 via `new Date(row.due_date).toISOString()`. `toMySQLDateTime` converts an ISO string to MySQL `DATETIME(3)` format (`YYYY-MM-DD HH:mm:ss.SSS`) by slicing ISO to 23 chars and replacing `T` with a space. Used on INSERT and UPDATE paths. `created_at` and `updated_at` are not returned in API responses despite existing in the database.

**Key files**

| File | Responsibility |
|------|---------------|
| `server.js` | Row formatting and datetime conversion |

**API surface / Public interface**

```javascript
formatTask(row) → { id, title, description, priority, status, due_date }
toMySQLDateTime(isoString) → "YYYY-MM-DD HH:mm:ss.SSS"
```

---

### 5.4  Tasks REST API Routes
<!-- VECTOR CHUNK: module:tasks-api-routes -->

| Field          | Detail |
|----------------|--------|
| Location       | `server.js` (routes under `/api/tasks`) |
| Type           | Route group |
| Depends on     | `db.js` pool, validation helpers, serialization helpers, `crypto.randomUUID` |
| Exposes        | `GET /api/tasks`, `POST /api/tasks`, `PUT /api/tasks/:id`, `DELETE /api/tasks/:id` |

**What it does (product view)**

This is the core feature set of the backend. It allows users to view all their tasks sorted by due date, add new tasks with a title and optional details, change any field on an existing task, and permanently remove a task. Every action the user takes in the Task Planner form or task table goes through one of these four endpoints.

**What it does (engineering view)**

All routes are `async` Express handlers using `pool.execute` with `?` placeholders (parameterized queries). **GET** selects all tasks ordered by `due_date ASC, created_at DESC`, maps rows through `formatTask`. **POST** validates body, generates UUID via `crypto.randomUUID()`, inserts six columns (`id`, `title`, `description`, `priority`, `` `status` ``, `due_date`), returns 201 with the task object (ISO `due_date` as submitted, not re-read from DB). **PUT** validates body, checks existence with `SELECT id`, returns 404 if missing, updates all mutable fields, returns updated object. **DELETE** selects full row first, returns 404 if missing, deletes by id, returns formatted deleted task. Errors log to `console.error` and return generic `{ error: "..." }` with 500 status. No pagination, filtering, or partial updates.

**Key files**

| File | Responsibility |
|------|---------------|
| `server.js` | All HTTP route definitions and handlers |

**API surface / Public interface**

See [Section 7. API Reference](#7-api-reference--vector-chunk-api).

**Data model / Schema** (if applicable)

MySQL table `tasks` (defined externally, documented in README):

```sql
CREATE TABLE tasks (
  id          CHAR(36)     NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT         NOT NULL,
  priority    ENUM('Low', 'Medium', 'High') NOT NULL DEFAULT 'Medium',
  `status`    ENUM('To Do', 'In Progress', 'Done') NOT NULL DEFAULT 'To Do',
  due_date    DATETIME(3)  NOT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
);
```

API response shape (subset of DB columns):

```typescript
{
  id: string;           // UUID
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High";
  status: "To Do" | "In Progress" | "Done";
  due_date: string;     // ISO 8601
}
```

---

### 5.5  HTTP Middleware & CORS
<!-- VECTOR CHUNK: module:http-middleware -->

| Field          | Detail |
|----------------|--------|
| Location       | `server.js` (top of file) |
| Type           | Middleware |
| Depends on     | `cors`, `express.json()`, `CORS_ORIGIN` env var |
| Exposes        | CORS policy, JSON body parsing |

**What it does (product view)**

This configuration allows the Task Planner website running in the browser to communicate with the API without being blocked by browser security rules. It ensures the frontend on port 3002 can send and receive task data safely during normal use.

**What it does (engineering view)**

`cors` middleware restricts `origin` to `process.env.CORS_ORIGIN` (default `http://localhost:3002`). Allowed methods: GET, POST, PUT, DELETE, OPTIONS. Allowed headers: Content-Type only. `express.json()` parses JSON request bodies. No rate limiting, helmet, request logging, or API key middleware.

**Key files**

| File | Responsibility |
|------|---------------|
| `server.js` | Middleware registration |

---

### 5.6  Server Bootstrap
<!-- VECTOR CHUNK: module:server-bootstrap -->

| Field          | Detail |
|----------------|--------|
| Location       | `server.js` (`startServer`, `startServer()` call) |
| Type           | Application entry |
| Depends on     | MySQL pool, `PORT` env var |
| Exposes        | Running HTTP server on configured port |

**What it does (product view)**

When an operator starts the backend, this logic verifies the database is reachable before accepting traffic. If the database is down, the service stops immediately with an error message rather than running in a broken state where users cannot save tasks.

**What it does (engineering view)**

`dotenv.config()` runs at the top of `server.js` before other imports side effects. `startServer` awaits `pool.query("SELECT 1")` as a connectivity probe; on failure logs error and `process.exit(1)`. On success logs database name and calls `app.listen(PORT)`. Default port 8002. No graceful shutdown on SIGTERM.

**Key files**

| File | Responsibility |
|------|---------------|
| `server.js` | Startup and listen |

---

## 6. Data Flow  <!-- VECTOR CHUNK: data-flow -->

**Primary user journey: Create a new task**

```
Browser (frontend)                Backend (server.js)              MySQL
      |                                  |                            |
      |  POST /api/tasks                 |                            |
      |  { title, description,           |                            |
      |    priority, status, due_date }|                            |
      |--------------------------------->|                            |
      |                                  | normalizeTaskPayload()     |
      |                                  | (validate + defaults)      |
      |                                  |                            |
      |                                  | crypto.randomUUID() → id   |
      |                                  |                            |
      |                                  | INSERT INTO tasks ...      |
      |                                  |--------------------------->|
      |                                  |                            | persist row
      |                                  |<---------------------------|
      |  201 { id, title, ... }          |                            |
      |<---------------------------------|                            |
```

**Step-by-step**

1. **Entry:** Frontend sends `POST /api/tasks` with JSON body to `http://localhost:8002`.
2. **Validation:** `normalizeTaskPayload` checks types and allowlists; returns 400 on failure.
3. **ID generation:** Server assigns UUID (not DB auto-increment).
4. **Transform:** `due_date` converted to MySQL datetime string via `toMySQLDateTime`.
5. **Persistence:** Parameterized `INSERT` into `tasks` table through connection pool.
6. **Response:** 201 with full task object including server-generated `id`.

**Update flow:** `PUT /api/tasks/:id` — validate → check row exists → `UPDATE` → return merged object.

**Delete flow:** `DELETE /api/tasks/:id` — `SELECT` row → if missing 404 → `DELETE` → return formatted deleted task.

**List flow:** `GET /api/tasks` — `SELECT` all → `formatTask` each row → JSON array.

---

## 7. API Reference  <!-- VECTOR CHUNK: api -->

Base URL: `http://localhost:8002` (default)

| Method | Path / Topic | Auth | Request shape | Response shape | Notes |
|--------|--------------|------|---------------|----------------|-------|
| GET | `/api/tasks` | none | — | `Task[]` | Ordered by `due_date ASC`, then `created_at DESC` |
| POST | `/api/tasks` | none | `{ title, description?, priority?, status?, due_date? }` | `Task` (201) | UUID generated server-side |
| PUT | `/api/tasks/:id` | none | Same as POST body | `Task` (200) | 404 if id not found |
| DELETE | `/api/tasks/:id` | none | — | `Task` (200) | Returns deleted task; 404 if not found |

**Task JSON shape**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Prepare demo",
  "description": "Optional notes",
  "priority": "High",
  "status": "To Do",
  "due_date": "2026-06-25T00:00:00.000Z"
}
```

**Error responses**

| Status | Body | When |
|--------|------|------|
| 400 | `{ "error": "title is required" }` etc. | Validation failure |
| 404 | `{ "error": "Task not found" }` | PUT/DELETE unknown id |
| 500 | `{ "error": "Failed to ..." }` | DB or server error |

---

## 8. Environment & Configuration  <!-- VECTOR CHUNK: config -->

| Variable | Required | Default | Description | Secret? |
|----------|----------|---------|-------------|---------|
| `PORT` | no | `8002` | HTTP listen port | no |
| `CORS_ORIGIN` | no | `http://localhost:3002` | Allowed browser origin | no |
| `DB_HOST` | yes | — | MySQL host | no |
| `DB_POD_PORT` | no | `3306` | MySQL port | no |
| `DB_POD_USERNAME` | yes | — | MySQL username | yes |
| `DB_POD_PASSWORD` | yes | — | MySQL password | yes |
| `DB_DATABASE` | yes | — | MySQL database name (e.g. `task_planner`) | no |

**Config files**

| File | Purpose | Committed? |
|------|---------|------------|
| `.env` | Local runtime secrets | no (gitignored) |
| `.env.example` | Template for developers | no (gitignored) |
| `package.json` | Dependencies and start script | yes |

---

## 9. Setup & Running

**Prerequisites**

- Node.js 18+ (recommended; exact minimum unknown)
- npm
- MySQL server with `task_planner` database and `tasks` table (see README.md or Section 5.4)

**Install**

```bash
cd task-planner-backend
npm install
cp .env.example .env
# Edit .env with real DB credentials
```

**Run (development)**

```bash
npm start
```

Expected output:

```
Connected to MySQL database: task_planner
Task Planner API running at http://localhost:8002
```

**Run (production)**

```bash
npm start
```

<!-- TODO: not found in codebase --> No separate production script, process manager, or clustering.

**Run tests**

<!-- TODO: not found in codebase --> No test files or test script in `package.json`.

---

## 10. Integration Points  <!-- VECTOR CHUNK: integrations -->

| System | Direction | Protocol | Auth method | Notes |
|--------|-----------|----------|-------------|-------|
| task-planner-frontend | Inbound (calls this API) | HTTP REST / JSON | none | Expected origin `http://localhost:3002` via CORS |
| MySQL (`task_planner.tasks`) | Outbound (this API calls DB) | MySQL wire protocol | username/password from `.env` | Connection pool, max 10 connections |

---

## 11. Known Constraints & Decisions  <!-- VECTOR CHUNK: decisions -->

- UUIDs are generated server-side with `crypto.randomUUID()`, not MySQL auto-increment, to keep IDs portable and client-friendly.
- All SQL uses parameterized queries (`?` placeholders) via `mysql2`; no ORM and no string-concatenated SQL.
- No authentication or authorization — any caller who can reach the API can CRUD all tasks.
- No pagination on `GET /api/tasks` — acceptable for small task volumes; all rows returned in one response.
- No filtering, sorting parameters, or search — sort order is fixed in SQL.
- `created_at` and `updated_at` exist in DB but are not exposed in API responses.
- `tasks.json` remains in the repo as a legacy artifact; `server.js` no longer reads or writes it after MySQL migration.
- Server exits on startup if MySQL is unreachable (`process.exit(1)`).
- CORS allows a single origin string, not an array of production/staging origins.
- Environment variable names use `DB_POD_*` prefix (historical naming); not standard `DB_USER` / `DB_PASSWORD`.
- `package-lock.json` and `.env.example` are gitignored per project policy.

---

## 12. Product Capabilities Summary  <!-- VECTOR CHUNK: product-capabilities -->

This repository powers the following product capabilities:

- **View all tasks:** Users can retrieve a complete list of tasks sorted by due date so they always see what is coming up next.
- **Create a task:** Users can add a new task with a title, optional description, priority level, workflow status, and due date; the system assigns a unique ID automatically.
- **Edit a task:** Users can change any detail on an existing task — title, notes, priority, status, or due date — and the update is saved to the database.
- **Delete a task:** Users can permanently remove a task; the system confirms the record existed and returns its final state.
- **Priority levels:** Tasks support three urgency levels — Low, Medium, and High — enforced consistently on save.
- **Workflow status:** Tasks track progress through To Do, In Progress, and Done states.
- **Due date tracking:** Every task has a due date stored as a datetime and returned to the app in a standard date format.
- **Frontend connectivity:** The API is configured to accept requests from the Task Planner web app so users can manage tasks through the browser UI.

A product manager querying the vector store with questions like *"How does task editing work?"*, *"What happens when a user deletes a task?"*, or *"Which module handles priority?"* should find answers in this section and in Section 5 module chunks (`module:tasks-api-routes`, `module:task-payload-validation`).

---

## 13. Glossary  <!-- VECTOR CHUNK: glossary -->

| Term | Meaning in this codebase |
|------|--------------------------|
| Task | A single work item with id, title, description, priority, status, and due_date |
| Priority | Urgency label: `Low`, `Medium`, or `High` |
| Status | Workflow stage: `To Do`, `In Progress`, or `Done` |
| Pool | MySQL connection pool in `db.js` shared across requests |
| UUID | 36-character unique id generated by Node `crypto.randomUUID()` |
| CORS | Cross-Origin Resource Sharing; restricts which frontend URL may call the API |
| Normalize | Validation step in `normalizeTaskPayload` that applies defaults and trims input |
| `tasks` table | MySQL table in `task_planner` database holding all task records |

---

## 14. Changelog / Version Notes

<!-- TODO: not found in codebase --> No `CHANGELOG.md`, git tags, or release notes found in this repository.

| Version | Date | Summary |
|---------|------|---------|
| 1.0.0 | unknown | Initial release per `package.json` |

---

## After generation — Vector DB ingestion hint

Each `<!-- VECTOR CHUNK: <tag> -->` comment marks a chunk boundary.

```json
{
  "repo": "task-planner-backend",
  "chunk": "<tag-value>",
  "module": "<module-name or null>",
  "section": "<section number>",
  "text": "<chunk content>"
}
```

**Suggested split strategy**

- Section 2 → 1 chunk (`purpose`)
- Section 5 → 1 chunk per module (`module:database-connection-pool`, `module:task-payload-validation`, `module:task-serialization`, `module:tasks-api-routes`, `module:http-middleware`, `module:server-bootstrap`)
- Sections 6–7 → 1 chunk each (`data-flow`, `api`)
- Section 10 → 1 chunk (`integrations`)
- Section 12 → 1 chunk (`product-capabilities`)
- Section 13 → 1 chunk (`glossary`)

**Product team query example**

*"What features does the task-planner-backend expose?"*
→ retrieves chunks: `purpose`, `api`, `product-capabilities`, `module:tasks-api-routes`
