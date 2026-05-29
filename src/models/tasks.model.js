const fs = require("fs")
const path = require("path")

const seedPath = path.join(__dirname, "../../data/seed.json")
let tasks = JSON.parse(fs.readFileSync(seedPath, "utf-8"))
let nextId = tasks.reduce((max, t) => Math.max(max, t.id), 0) + 1

function parseTaskId(id) {
  const str = String(id)
  if (!/^\d+$/.test(str)) return NaN
  const num = Number(str)
  return Number.isSafeInteger(num) ? num : NaN
}

const TaskModel = {
  findAll(filters = {}) {
    let result = tasks

    if (filters.status) {
      result = result.filter((t) => t.status === filters.status)
    }

    if (filters.assignee) {
      result = result.filter((t) => t.assignee === filters.assignee)
    }

    if (filters.priority) {
      const filterPriority = String(filters.priority).toUpperCase()
      result = result.filter(
        (t) =>
          typeof t.priority === "string" &&
          t.priority.toUpperCase() === filterPriority
      )
    }

    return result
  },

  findById(id) {
    const taskId = parseTaskId(id)
    if (Number.isNaN(taskId)) return undefined
    return tasks.find((t) => t.id === taskId)
  },

  create(data) {
    const task = {
      id: nextId++,
      title: data.title,
      description: data.description || "",
      status: data.status || "todo",
      priority: data.priority || "MEDIUM",
      assignee: data.assignee || null,
      dueDate: data.dueDate,
      createdAt: new Date().toISOString(),
    }
    tasks.push(task)
    return task
  },

  update(id, data) {
    const taskId = parseTaskId(id)
    if (Number.isNaN(taskId)) return null
    const idx = tasks.findIndex((t) => t.id === taskId)
    if (idx === -1) return null
    tasks[idx] = { ...tasks[idx], ...data, id: tasks[idx].id }
    return tasks[idx]
  },

  delete(id) {
    const taskId = parseTaskId(id)
    if (Number.isNaN(taskId)) return null
    const idx = tasks.findIndex((t) => t.id === taskId)
    if (idx === -1) return null
    const deleted = tasks[idx]
    tasks.splice(idx, 1)
    return deleted
  },

  getAll() {
    return tasks
  },
}

module.exports = TaskModel
