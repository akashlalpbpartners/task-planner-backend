# Task Planner — Backend

REST API for the Task Planner application. Provides full CRUD operations for tasks, backed by a MySQL database.

## Tech Stack

- **Node.js** + **Express**
- **MySQL** via `mysql2` (connection pool, parameterized queries)
- **CORS** for frontend access
- **dotenv** for environment configuration

## Project Structure

```
task-planner-backend/
├── db.js           # MySQL connection pool
├── server.js       # Express app and API routes
├── package.json
├── .env            # Local environment variables (not committed)
├── .env.example    # Template for environment variables
└── .gitignore
```

## Prerequisites

- Node.js 18+
- MySQL 5.7+ or 8.x
- Access to a MySQL database with a `tasks` table (see [Database Setup](#database-setup))

## Database Setup

Create the database and table:

```sql
CREATE DATABASE IF NOT EXISTS task_planner
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE task_planner;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

## Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

| Variable           | Description                          | Default                    |
|--------------------|--------------------------------------|----------------------------|
| `PORT`             | API server port                      | `8002`                     |
| `CORS_ORIGIN`      | Allowed frontend origin              | `http://localhost:3002`    |
| `DB_HOST`          | MySQL host                           | —                          |
| `DB_POD_PORT`      | MySQL port                           | `3306`                     |
| `DB_POD_USERNAME`  | MySQL username                       | —                          |
| `DB_POD_PASSWORD`  | MySQL password                       | —                          |
| `DB_DATABASE`      | MySQL database name                  | `task_planner`             |

## Installation & Running

```bash
npm install
npm start
```

On success:

```
Connected to MySQL database: task_planner
Task Planner API running at http://localhost:8002
```

The server verifies the MySQL connection on startup and exits if the database is unreachable.

## API Endpoints

Base URL: `http://localhost:8002`

### Task Object Schema

```json
{
  "id": "uuid-string",
  "title": "string",
  "description": "string",
  "priority": "Low | Medium | High",
  "status": "To Do | In Progress | Done",
  "due_date": "ISO 8601 date string"
}
```

### `GET /api/tasks`

Returns all tasks, ordered by due date.

**Response:** `200 OK` — array of task objects

### `POST /api/tasks`

Creates a new task. A UUID is generated server-side.

**Request body:**

```json
{
  "title": "Prepare demo",
  "description": "Optional notes",
  "priority": "High",
  "status": "To Do",
  "due_date": "2026-06-25T00:00:00.000Z"
}
```

**Response:** `201 Created` — created task object

### `PUT /api/tasks/:id`

Updates an existing task by ID.

**Request body:** Same fields as `POST`.

**Response:** `200 OK` — updated task object  
**Errors:** `404` if task not found, `400` for invalid payload

### `DELETE /api/tasks/:id`

Deletes a task by ID.

**Response:** `200 OK` — deleted task object  
**Errors:** `404` if task not found

## Validation Rules

- `title` — required, non-empty string
- `description` — optional string (defaults to `""`)
- `priority` — `Low`, `Medium`, or `High` (default: `Medium`)
- `status` — `To Do`, `In Progress`, or `Done` (default: `To Do`)
- `due_date` — ISO date string (default: current timestamp)

## Frontend Integration

The API is consumed by [task-planner-frontend](../task-planner-frontend) running on port **3002**. CORS is configured to accept requests from that origin.

Ensure the backend is running before starting the frontend.

## Security Notes

- All SQL queries use parameterized statements (no string concatenation).
- `.env` is gitignored — never commit credentials.
- Use strong database passwords and restrict network access in production.
