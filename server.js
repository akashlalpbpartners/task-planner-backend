require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const pool = require("./db");

const app = express();
const PORT = process.env.PORT || 8002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3002";

app.use(
  cors({
    origin: CORS_ORIGIN,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

function isValidPriority(priority) {
  return ["Low", "Medium", "High"].includes(priority);
}

function isValidStatus(status) {
  return ["To Do", "In Progress", "Done"].includes(status);
}

function normalizeTaskPayload(body) {
  const { title, description, priority, status, due_date } = body;

  if (!title || typeof title !== "string" || !title.trim()) {
    return { error: "title is required" };
  }

  if (description !== undefined && typeof description !== "string") {
    return { error: "description must be a string" };
  }

  if (priority !== undefined && !isValidPriority(priority)) {
    return { error: "priority must be Low, Medium, or High" };
  }

  if (status !== undefined && !isValidStatus(status)) {
    return { error: "status must be To Do, In Progress, or Done" };
  }

  if (due_date !== undefined && typeof due_date !== "string") {
    return { error: "due_date must be an ISO date string" };
  }

  return {
    task: {
      title: title.trim(),
      description: typeof description === "string" ? description : "",
      priority: priority || "Medium",
      status: status || "To Do",
      due_date: due_date || new Date().toISOString(),
    },
  };
}

function formatTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    priority: row.priority,
    status: row.status,
    due_date: new Date(row.due_date).toISOString(),
  };
}

function toMySQLDateTime(isoString) {
  return new Date(isoString).toISOString().slice(0, 23).replace("T", " ");
}

app.get("/api/tasks", async (_req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT id, title, description, priority, `status`, due_date FROM tasks ORDER BY due_date ASC, created_at DESC"
    );
    res.json(rows.map(formatTask));
  } catch (error) {
    console.error("GET /api/tasks failed:", error.message);
    res.status(500).json({ error: "Failed to read tasks" });
  }
});

app.post("/api/tasks", async (req, res) => {
  try {
    const result = normalizeTaskPayload(req.body);

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    const newTask = {
      id: crypto.randomUUID(),
      ...result.task,
    };

    await pool.execute(
      "INSERT INTO tasks (id, title, description, priority, `status`, due_date) VALUES (?, ?, ?, ?, ?, ?)",
      [
        newTask.id,
        newTask.title,
        newTask.description,
        newTask.priority,
        newTask.status,
        toMySQLDateTime(newTask.due_date),
      ]
    );

    res.status(201).json(newTask);
  } catch (error) {
    console.error("POST /api/tasks failed:", error.message);
    res.status(500).json({ error: "Failed to create task" });
  }
});

app.put("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = normalizeTaskPayload(req.body);

    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }

    const [existing] = await pool.execute(
      "SELECT id FROM tasks WHERE id = ?",
      [id]
    );

    if (existing.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const updatedTask = {
      id,
      ...result.task,
    };

    await pool.execute(
      "UPDATE tasks SET title = ?, description = ?, priority = ?, `status` = ?, due_date = ? WHERE id = ?",
      [
        updatedTask.title,
        updatedTask.description,
        updatedTask.priority,
        updatedTask.status,
        toMySQLDateTime(updatedTask.due_date),
        id,
      ]
    );

    res.json(updatedTask);
  } catch (error) {
    console.error("PUT /api/tasks/:id failed:", error.message);
    res.status(500).json({ error: "Failed to update task" });
  }
});

app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      "SELECT id, title, description, priority, `status`, due_date FROM tasks WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    await pool.execute("DELETE FROM tasks WHERE id = ?", [id]);
    res.json(formatTask(rows[0]));
  } catch (error) {
    console.error("DELETE /api/tasks/:id failed:", error.message);
    res.status(500).json({ error: "Failed to delete task" });
  }
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log(`Connected to MySQL database: ${process.env.DB_DATABASE}`);
  } catch (error) {
    console.error("MySQL connection failed:", error.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Task Planner API running at http://localhost:${PORT}`);
  });
}

startServer();
