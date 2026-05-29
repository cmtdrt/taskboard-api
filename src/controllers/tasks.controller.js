const TaskModel = require("../models/tasks.model")

const VALID_STATUSES = ["todo", "doing", "done"]
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH"]

const tasksController = {
  getTasks(req, res) {
    const { status, assignee, priority } = req.query
    const tasks = TaskModel.findAll({ status, assignee, priority })
    res.json({ success: true, data: tasks })
  },

  getTaskById(req, res) {
    const task = TaskModel.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" })
    }
    res.json({ success: true, data: task })
  },

  createTask(req, res) {
    const { title, description, status, priority, assignee, dueDate } = req.body

    if (!title || !String(title).trim()) {
      return res
        .status(400)
        .json({ success: false, error: "Title is required" })
    }

    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
      })
    }

    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: `Priority must be one of: ${VALID_PRIORITIES.join(", ")}`,
      })
    }

    const task = TaskModel.create({
      title,
      description,
      status,
      priority,
      assignee,
      dueDate,
    })
    res.status(201).json({ success: true, data: task })
  },

  updateTask(req, res) {
    const task = TaskModel.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" })
    }

    const { title, status, priority } = req.body

    if (title !== undefined && (!title || !String(title).trim())) {
      return res
        .status(400)
        .json({ success: false, error: "Title is required" })
    }

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
      })
    }

    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        success: false,
        error: `Priority must be one of: ${VALID_PRIORITIES.join(", ")}`,
      })
    }

    const updated = TaskModel.update(req.params.id, req.body)
    res.json({ success: true, data: updated })
  },

  deleteTask(req, res) {
    const deleted = TaskModel.delete(req.params.id)
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Task not found" })
    }
    res.json({ success: true, data: deleted })
  },

  moveTask(req, res) {
    const task = TaskModel.findById(req.params.id)
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found" })
    }

    const { status } = req.body
    if (!status) {
      return res
        .status(400)
        .json({ success: false, error: "New status is required" })
    }
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${VALID_STATUSES.join(", ")}`,
      })
    }
    const updated = TaskModel.update(req.params.id, { status })
    res.json({ success: true, data: updated })
  },

  getStats(req, res) {
    const tasks = TaskModel.getAll()

    const byStatus = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1
      return acc
    }, {})

    const byPriority = tasks.reduce((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1
      return acc
    }, {})

    const now = new Date()
    const overdue = tasks.filter((task) => {
      const due = new Date(task.dueDate)
      return due < now
    }).length

    res.json({
      success: true,
      data: {
        total: tasks.length,
        byStatus,
        byPriority,
        overdue,
      },
    })
  },
}

module.exports = tasksController
