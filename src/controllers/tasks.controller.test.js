const fs = require("fs")
const path = require("path")
const request = require("supertest")

const seedPath = path.join(__dirname, "../../data/seed.json")
const seedTasks = JSON.parse(fs.readFileSync(seedPath, "utf-8"))
const NULL_DUE_DATE_TASK_IDS = [7, 14, 19, 25]
const DONE_OVERDUE_TASK_IDS = [1, 2, 12, 17, 26]

const API_KEY = "secret-key-123"
const VALID_STATUSES = ["todo", "doing", "done"]
const VALID_PRIORITIES = ["LOW", "MEDIUM", "HIGH"]
const STATUS_ERROR = `Status must be one of: ${VALID_STATUSES.join(", ")}`
const PRIORITY_ERROR = `Priority must be one of: ${VALID_PRIORITIES.join(", ")}`
const TITLE_REQUIRED = "Title is required"

function mockRes() {
  const res = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

function countOverdueExcludingNullDueDate(tasks, now = new Date()) {
  return tasks.filter((task) => {
    if (task.dueDate == null) return false
    const due = new Date(task.dueDate)
    return !Number.isNaN(due.getTime()) && due < now
  }).length
}

function countOverdueWithBuggyLogic(tasks, now = new Date()) {
  return tasks.filter((task) => new Date(task.dueDate) < now).length
}

/** Comportement attendu après bugs #8 et #9 */
function countOverdueExpected(tasks, now = new Date()) {
  return tasks.filter((task) => {
    if (task.status === "done") return false
    if (task.dueDate == null) return false
    const due = new Date(task.dueDate)
    return !Number.isNaN(due.getTime()) && due < now
  }).length
}

/**
 * npm test -- --testPathPattern=tasks.controller.test.js
 */
describe("moveTask — Bug #3 (tests unitaires)", () => {
  let TaskModel
  let tasksController
  let req
  let res
  let next

  beforeEach(() => {
    jest.resetModules()
    jest.mock("../models/tasks.model", () => ({
      findById: jest.fn(),
      update: jest.fn(),
    }))
    TaskModel = require("../models/tasks.model")
    tasksController = require("./tasks.controller")

    req = { params: { id: "1" }, body: {} }
    res = mockRes()
    next = jest.fn()
  })

  describe("comportement attendu (aligné sur createTask)", () => {
    beforeEach(() => {
      TaskModel.findById.mockReturnValue({
        id: 1,
        title: "Tâche test",
        status: "todo",
      })
    })

    it.each(["invalid", "archived", "TODO", "donee"])(
      "devrait retourner 400 pour un statut invalide : %s",
      (status) => {
        req.body = { status }

        tasksController.moveTask(req, res, next)

        expect(TaskModel.update).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: STATUS_ERROR,
        })
      }
    )

    it.each(VALID_STATUSES)("devrait accepter le statut valide : %s", (status) => {
      const updated = { id: 1, title: "Tâche test", status }
      TaskModel.update.mockReturnValue(updated)
      req.body = { status }

      tasksController.moveTask(req, res, next)

      expect(TaskModel.update).toHaveBeenCalledWith("1", { status })
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated })
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe("cas déjà gérés (référence)", () => {
    it("devrait retourner 404 si la tâche n'existe pas", () => {
      TaskModel.findById.mockReturnValue(undefined)

      tasksController.moveTask(req, res, next)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Task not found",
      })
    })

    it("devrait retourner 400 si status est absent", () => {
      TaskModel.findById.mockReturnValue({ id: 1, status: "todo" })
      req.body = {}

      tasksController.moveTask(req, res, next)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "New status is required",
      })
      expect(TaskModel.update).not.toHaveBeenCalled()
    })
  })
})

describe("PATCH /api/tasks/:id/move — Bug #3 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.unmock("../models/tasks.model")
    app = require("../app")
  })

  const authHeader = { "x-api-key": API_KEY }

  it("devrait rejeter un statut invalide avec 400 (README / createTask)", async () => {
    const response = await request(app)
      .patch("/api/tasks/1/move")
      .set(authHeader)
      .send({ status: "invalid" })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      error: STATUS_ERROR,
    })
  })

  it("ne doit pas persister un statut invalide en base", async () => {
    await request(app)
      .patch("/api/tasks/2/move")
      .set(authHeader)
      .send({ status: "archived" })

    const task = await request(app)
      .get("/api/tasks/2")
      .set(authHeader)

    expect(task.body.data.status).not.toBe("archived")
  })

  it("devrait déplacer une tâche vers doing avec un statut valide", async () => {
    const response = await request(app)
      .patch("/api/tasks/4/move")
      .set(authHeader)
      .send({ status: "doing" })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe("doing")
  })

  it("devrait retourner 400 sans status dans le body", async () => {
    const response = await request(app)
      .patch("/api/tasks/1/move")
      .set(authHeader)
      .send({})

    expect(response.status).toBe(400)
    expect(response.body.error).toBe("New status is required")
  })

  it("devrait retourner 404 pour une tâche inexistante", async () => {
    const response = await request(app)
      .patch("/api/tasks/99999/move")
      .set(authHeader)
      .send({ status: "done" })

    expect(response.status).toBe(404)
    expect(response.body.error).toBe("Task not found")
  })
})

describe("updateTask — Bug #4 (corrigé — validation PUT)", () => {
  let TaskModel
  let tasksController
  let req
  let res

  const existingTask = {
    id: 2,
    title: "Concevoir la base de données",
    status: "done",
    priority: "HIGH",
    assignee: "bob",
  }

  beforeEach(() => {
    jest.resetModules()
    jest.mock("../models/tasks.model", () => ({
      findById: jest.fn(),
      update: jest.fn(),
    }))
    TaskModel = require("../models/tasks.model")
    tasksController = require("./tasks.controller")

    req = { params: { id: "2" }, body: {} }
    res = mockRes()
    TaskModel.findById.mockReturnValue({ ...existingTask })
  })

  describe("comportement attendu (aligné sur createTask / README)", () => {
    it.each(["archived", "invalid", "TODO"])(
      "devrait retourner 400 pour un status invalide : %s",
      (status) => {
        req.body = { status }

        tasksController.updateTask(req, res)

        expect(TaskModel.update).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: STATUS_ERROR,
        })
      }
    )

    it.each(["urgent", "high", "INVALID"])(
      "devrait retourner 400 pour une priority invalide : %s",
      (priority) => {
        req.body = { priority }

        tasksController.updateTask(req, res)

        expect(TaskModel.update).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: PRIORITY_ERROR,
        })
      }
    )

    it("devrait retourner 400 pour un title vide", () => {
      req.body = { title: "" }

      tasksController.updateTask(req, res)

      expect(TaskModel.update).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: TITLE_REQUIRED,
      })
    })

    it("devrait retourner 400 pour un title composé uniquement d'espaces", () => {
      req.body = { title: "   " }

      tasksController.updateTask(req, res)

      expect(TaskModel.update).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: TITLE_REQUIRED,
      })
    })
  })

  describe("mises à jour valides (référence)", () => {
    it.each(VALID_STATUSES)("devrait accepter un status valide : %s", (status) => {
      const updated = { ...existingTask, status }
      TaskModel.update.mockReturnValue(updated)
      req.body = { status }

      tasksController.updateTask(req, res)

      expect(TaskModel.update).toHaveBeenCalledWith("2", { status })
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated })
    })

    it.each(VALID_PRIORITIES)("devrait accepter une priority valide : %s", (priority) => {
      const updated = { ...existingTask, priority }
      TaskModel.update.mockReturnValue(updated)
      req.body = { priority }

      tasksController.updateTask(req, res)

      expect(TaskModel.update).toHaveBeenCalledWith("2", { priority })
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated })
    })

    it("devrait accepter une mise à jour partielle du title", () => {
      const updated = { ...existingTask, title: "Nouveau titre" }
      TaskModel.update.mockReturnValue(updated)
      req.body = { title: "Nouveau titre" }

      tasksController.updateTask(req, res)

      expect(TaskModel.update).toHaveBeenCalledWith("2", { title: "Nouveau titre" })
      expect(res.json).toHaveBeenCalledWith({ success: true, data: updated })
    })
  })

  describe("cas déjà gérés (référence)", () => {
    it("devrait retourner 404 si la tâche n'existe pas", () => {
      TaskModel.findById.mockReturnValue(undefined)

      tasksController.updateTask(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Task not found",
      })
      expect(TaskModel.update).not.toHaveBeenCalled()
    })
  })
})

describe("PUT /api/tasks/:id — Bug #4 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.unmock("../models/tasks.model")
    app = require("../app")
  })

  const authHeader = { "x-api-key": API_KEY }

  it("devrait rejeter un status invalide avec 400", async () => {
    const response = await request(app)
      .put("/api/tasks/2")
      .set(authHeader)
      .send({ status: "archived" })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      error: STATUS_ERROR,
    })
  })

  it("ne doit pas persister un status invalide en base", async () => {
    await request(app)
      .put("/api/tasks/3")
      .set(authHeader)
      .send({ status: "archived" })

    const task = await request(app)
      .get("/api/tasks/3")
      .set(authHeader)

    expect(task.body.data.status).not.toBe("archived")
  })

  it("devrait rejeter une priority invalide avec 400", async () => {
    const response = await request(app)
      .put("/api/tasks/5")
      .set(authHeader)
      .send({ priority: "urgent" })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      error: PRIORITY_ERROR,
    })
  })

  it("devrait rejeter un title vide avec 400", async () => {
    const response = await request(app)
      .put("/api/tasks/4")
      .set(authHeader)
      .send({ title: "" })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      error: TITLE_REQUIRED,
    })
  })

  it("devrait mettre à jour une tâche avec des champs valides", async () => {
    const response = await request(app)
      .put("/api/tasks/6")
      .set(authHeader)
      .send({ title: "Documentation mise à jour", priority: "LOW" })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.title).toBe("Documentation mise à jour")
    expect(response.body.data.priority).toBe("LOW")
  })

  it("devrait retourner 404 pour une tâche inexistante", async () => {
    const response = await request(app)
      .put("/api/tasks/99999")
      .set(authHeader)
      .send({ title: "Test" })

    expect(response.status).toBe(404)
    expect(response.body.error).toBe("Task not found")
  })
})

describe("createTask — Bug #5 (corrigé — validation priority POST)", () => {
  let TaskModel
  let tasksController
  let req
  let res

  beforeEach(() => {
    jest.resetModules()
    jest.mock("../models/tasks.model", () => ({
      create: jest.fn(),
    }))
    TaskModel = require("../models/tasks.model")
    tasksController = require("./tasks.controller")

    req = { body: { title: "Nouvelle tâche" } }
    res = mockRes()
  })

  describe("comportement attendu (README : LOW, MEDIUM, HIGH)", () => {
    it.each(["urgent", "high", "INVALID", ""])(
      "devrait retourner 400 pour une priority invalide : %s",
      (priority) => {
        req.body = { title: "Test", priority }

        tasksController.createTask(req, res)

        expect(TaskModel.create).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: PRIORITY_ERROR,
        })
      }
    )

    it.each(VALID_PRIORITIES)("devrait accepter une priority valide : %s", (priority) => {
      const created = {
        id: 31,
        title: "Test",
        priority,
        status: "todo",
        description: "",
        assignee: null,
        createdAt: "2026-01-01T00:00:00.000Z",
      }
      TaskModel.create.mockReturnValue(created)
      req.body = { title: "Test", priority }

      tasksController.createTask(req, res)

      expect(TaskModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Test", priority })
      )
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith({ success: true, data: created })
    })

    it("devrait créer sans priority (défaut MEDIUM côté modèle)", () => {
      const created = {
        id: 32,
        title: "Sans priorité",
        priority: "MEDIUM",
        status: "todo",
      }
      TaskModel.create.mockReturnValue(created)
      req.body = { title: "Sans priorité" }

      tasksController.createTask(req, res)

      expect(TaskModel.create).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(201)
    })
  })

  describe("référence — validations déjà en place", () => {
    it("devrait toujours exiger un title", () => {
      req.body = { priority: "HIGH" }

      tasksController.createTask(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: TITLE_REQUIRED,
      })
    })

    it("devrait rejeter un status invalide", () => {
      req.body = { title: "Test", status: "archived", priority: "HIGH" }

      tasksController.createTask(req, res)

      expect(TaskModel.create).not.toHaveBeenCalled()
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: STATUS_ERROR,
      })
    })
  })
})

describe("POST /api/tasks — Bug #5 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.unmock("../models/tasks.model")
    app = require("../app")
  })

  const authHeader = { "x-api-key": API_KEY }

  it("devrait rejeter priority=urgent avec 400", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({ title: "Test priorité", priority: "urgent" })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      error: PRIORITY_ERROR,
    })
  })

  it("ne doit pas créer une tâche avec une priority invalide", async () => {
    const before = await request(app).get("/api/tasks").set(authHeader)
    const countBefore = before.body.data.length

    await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({ title: "Tâche invalide", priority: "urgent" })

    const after = await request(app).get("/api/tasks").set(authHeader)
    const invalidTasks = after.body.data.filter((t) => t.title === "Tâche invalide")

    expect(after.body.data.length).toBe(countBefore)
    expect(invalidTasks).toHaveLength(0)
  })

  it("devrait créer une tâche avec priority=HIGH", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({
        title: "Tâche valide HIGH",
        priority: "HIGH",
        status: "todo",
      })

    expect(response.status).toBe(201)
    expect(response.body.data.priority).toBe("HIGH")
    expect(response.body.data.title).toBe("Tâche valide HIGH")
  })

  it("devrait créer une tâche sans priority (défaut MEDIUM)", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({ title: "Tâche défaut priorité" })

    expect(response.status).toBe(201)
    expect(response.body.data.priority).toBe("MEDIUM")
  })
})

describe("createTask — Bug #6 (corrigé — title vide ou espaces POST)", () => {
  let TaskModel
  let tasksController
  let req
  let res

  beforeEach(() => {
    jest.resetModules()
    jest.mock("../models/tasks.model", () => ({
      create: jest.fn(),
    }))
    TaskModel = require("../models/tasks.model")
    tasksController = require("./tasks.controller")

    req = { body: {} }
    res = mockRes()
  })

  describe("comportement attendu", () => {
    it.each(["   ", "\t", "\n", "  \t  "])(
      "devrait retourner 400 pour un title composé uniquement d'espaces : %j",
      (title) => {
        req.body = { title }

        tasksController.createTask(req, res)

        expect(TaskModel.create).not.toHaveBeenCalled()
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: TITLE_REQUIRED,
        })
      }
    )
  })

  describe("référence", () => {
    it("devrait retourner 400 pour un title vide", () => {
      req.body = { title: "" }

      tasksController.createTask(req, res)

      expect(TaskModel.create).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: TITLE_REQUIRED,
      })
    })

    it("devrait retourner 400 si title est absent", () => {
      req.body = {}

      tasksController.createTask(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: TITLE_REQUIRED,
      })
    })

    it("devrait créer une tâche avec un title non vide", () => {
      const created = { id: 40, title: "Titre valide", status: "todo", priority: "MEDIUM" }
      TaskModel.create.mockReturnValue(created)
      req.body = { title: "Titre valide" }

      tasksController.createTask(req, res)

      expect(TaskModel.create).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(201)
    })
  })
})

describe("POST /api/tasks — Bug #6 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.unmock("../models/tasks.model")
    app = require("../app")
  })

  const authHeader = { "x-api-key": API_KEY }

  it('devrait rejeter { "title": "   " } avec 400', async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({ title: "   " })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({
      success: false,
      error: TITLE_REQUIRED,
    })
  })

  it("ne doit pas créer de tâche avec un title uniquement composé d'espaces", async () => {
    const before = await request(app).get("/api/tasks").set(authHeader)
    const countBefore = before.body.data.length

    await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({ title: "   " })

    const after = await request(app).get("/api/tasks").set(authHeader)
    const whitespaceTitles = after.body.data.filter(
      (t) => typeof t.title === "string" && t.title.trim() === ""
    )

    expect(after.body.data.length).toBe(countBefore)
    expect(whitespaceTitles).toHaveLength(0)
  })

  it("devrait créer une tâche avec un title valide", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set(authHeader)
      .send({ title: "Tâche bug 6 OK" })

    expect(response.status).toBe(201)
    expect(response.body.data.title).toBe("Tâche bug 6 OK")
  })
})

const TASK_3_CREATED_AT = "2024-01-10T10:00:00Z"
const FAKE_CREATED_AT = "2099-01-01T00:00:00Z"

/**
 * Bug #7 (corrigé) — createdAt et id immuables via PUT.
 * npm test -- --testPathPattern=tasks.controller.test.js
 */
describe("updateTask — Bug #7 (createdAt immuable)", () => {
  let TaskModel
  let tasksController
  let req
  let res

  const existingTask = {
    id: 3,
    title: "Implémenter l'API REST",
    status: "doing",
    priority: "HIGH",
    assignee: "alice",
    createdAt: TASK_3_CREATED_AT,
  }

  beforeEach(() => {
    jest.resetModules()
    jest.mock("../models/tasks.model", () => ({
      findById: jest.fn(),
      update: jest.fn(),
    }))
    TaskModel = require("../models/tasks.model")
    tasksController = require("./tasks.controller")

    req = { params: { id: "3" }, body: {} }
    res = mockRes()
    TaskModel.findById.mockReturnValue({ ...existingTask })
  })

  describe("comportement attendu", () => {
    it("ne doit pas transmettre createdAt à TaskModel.update", () => {
      req.body = { createdAt: FAKE_CREATED_AT }

      tasksController.updateTask(req, res)

      expect(TaskModel.update).toHaveBeenCalledWith("3", {})
      expect(TaskModel.update.mock.calls[0][1]).not.toHaveProperty("createdAt")
    })

    it("doit ignorer createdAt tout en appliquant les autres champs valides", () => {
      const updated = {
        ...existingTask,
        title: "Titre mis à jour",
        createdAt: TASK_3_CREATED_AT,
      }
      TaskModel.update.mockReturnValue(updated)
      req.body = { title: "Titre mis à jour", createdAt: FAKE_CREATED_AT }

      tasksController.updateTask(req, res)

      expect(TaskModel.update).toHaveBeenCalledWith("3", { title: "Titre mis à jour" })
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          title: "Titre mis à jour",
          createdAt: TASK_3_CREATED_AT,
        }),
      })
    })
  })
})

describe("PUT /api/tasks/:id — Bug #7 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.unmock("../models/tasks.model")
    app = require("../app")
  })

  const authHeader = { "x-api-key": API_KEY }

  it("ne doit pas modifier createdAt via PUT", async () => {
    const response = await request(app)
      .put("/api/tasks/3")
      .set(authHeader)
      .send({ createdAt: FAKE_CREATED_AT })

    expect(response.status).toBe(200)
    expect(response.body.data.createdAt).toBe(TASK_3_CREATED_AT)
    expect(response.body.data.createdAt).not.toBe(FAKE_CREATED_AT)
  })

  it("doit conserver createdAt d'origine après GET", async () => {
    await request(app)
      .put("/api/tasks/3")
      .set(authHeader)
      .send({ createdAt: FAKE_CREATED_AT })

    const task = await request(app)
      .get("/api/tasks/3")
      .set(authHeader)

    expect(task.status).toBe(200)
    expect(task.body.data.createdAt).toBe(TASK_3_CREATED_AT)
  })

  it("ne doit pas permettre de modifier id via PUT", async () => {
    const before = await request(app)
      .get("/api/tasks/3")
      .set(authHeader)

    await request(app)
      .put("/api/tasks/3")
      .set(authHeader)
      .send({ id: 99999, createdAt: FAKE_CREATED_AT })

    const after = await request(app)
      .get("/api/tasks/3")
      .set(authHeader)

    expect(after.body.data.id).toBe(3)
    expect(after.body.data.id).toBe(before.body.data.id)
    expect(after.body.data.createdAt).toBe(TASK_3_CREATED_AT)
  })
})

/**
 * Bug #8 (corrigé) — dueDate null exclues de overdue (stats).
 * npm test -- --testPathPattern=tasks.controller.test.js
 */
describe("getStats — Bug #8 (corrigé — dueDate null exclues de overdue)", () => {
  let TaskModel
  let tasksController
  let req
  let res

  beforeEach(() => {
    jest.resetModules()
    jest.mock("../models/tasks.model", () => ({
      getAll: jest.fn(),
    }))
    TaskModel = require("../models/tasks.model")
    tasksController = require("./tasks.controller")

    req = {}
    res = mockRes()
  })

  it("ne doit pas compter les tâches sans dueDate dans overdue", () => {
    TaskModel.getAll.mockReturnValue([
      { id: 1, dueDate: null, status: "todo" },
      { id: 2, dueDate: "2024-01-01", status: "todo" },
      { id: 3, dueDate: null, status: "doing" },
      { id: 4, dueDate: "2030-01-01", status: "todo" },
    ])

    tasksController.getStats(req, res)

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ overdue: 1 }),
    })
  })

  it("devrait renvoyer overdue à 0 si toutes les tâches n'ont pas de dueDate", () => {
    TaskModel.getAll.mockReturnValue([
      { id: 7, dueDate: null },
      { id: 14, dueDate: null },
    ])

    tasksController.getStats(req, res)

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ overdue: 0 }),
    })
  })
})

describe("GET /api/tasks/stats — Bug #8 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.unmock("../models/tasks.model")
    app = require("../app")
  })

  it("ne doit pas inclure les tâches dueDate null dans overdue (seed)", async () => {
    const expectedOverdue = countOverdueExcludingNullDueDate(seedTasks)
    const buggyOverdue = countOverdueWithBuggyLogic(seedTasks)

    expect(NULL_DUE_DATE_TASK_IDS).toHaveLength(4)
    expect(buggyOverdue).toBeGreaterThanOrEqual(expectedOverdue + 4)

    const response = await request(app).get("/api/tasks/stats")

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data.overdue).toBe(expectedOverdue)
    expect(response.body.data.overdue).toBeLessThan(buggyOverdue)
  })

  it("overdue ne doit pas augmenter uniquement à cause des ids 7, 14, 19, 25 du seed", async () => {
    const response = await request(app).get("/api/tasks/stats")
    const nullDueInSeed = NULL_DUE_DATE_TASK_IDS.length

    expect(response.body.data.overdue).toBeLessThanOrEqual(
      countOverdueWithBuggyLogic(seedTasks) - nullDueInSeed
    )
  })
})

/**
 * Bug #9 — tâches done incluses dans overdue (stats).
 * npm test -- --testPathPattern=tasks.controller.test.js
 */
describe("getStats — Bug #9 (tâches done exclues de overdue)", () => {
  let TaskModel
  let tasksController
  let req
  let res

  beforeEach(() => {
    jest.resetModules()
    jest.mock("../models/tasks.model", () => ({
      getAll: jest.fn(),
    }))
    TaskModel = require("../models/tasks.model")
    tasksController = require("./tasks.controller")

    req = {}
    res = mockRes()
  })

  it("ne doit pas compter une tâche done avec échéance passée", () => {
    TaskModel.getAll.mockReturnValue([
      { id: 1, status: "done", dueDate: "2024-01-01" },
      { id: 2, status: "todo", dueDate: "2024-01-01" },
      { id: 3, status: "doing", dueDate: "2030-01-01" },
    ])

    tasksController.getStats(req, res)

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ overdue: 1 }),
    })
  })

  it("devrait renvoyer overdue à 0 si seules des tâches done sont en retard", () => {
    TaskModel.getAll.mockReturnValue([
      { id: 1, status: "done", dueDate: "2024-01-01" },
      { id: 2, status: "done", dueDate: "2023-06-15" },
    ])

    tasksController.getStats(req, res)

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ overdue: 0 }),
    })
  })
})

describe("GET /api/tasks/stats — Bug #9 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    jest.unmock("../models/tasks.model")
    app = require("../app")
  })

  it("ne doit pas inclure les tâches done du seed dans overdue", async () => {
    const expectedOverdue = countOverdueExpected(seedTasks)
    const withDoneIncluded = countOverdueExcludingNullDueDate(seedTasks)

    expect(DONE_OVERDUE_TASK_IDS.length).toBeGreaterThan(0)
    expect(withDoneIncluded).toBeGreaterThan(expectedOverdue)

    const response = await request(app).get("/api/tasks/stats")

    expect(response.status).toBe(200)
    expect(response.body.data.overdue).toBe(expectedOverdue)
    expect(response.body.data.overdue).toBeLessThan(withDoneIncluded)
  })

  it("overdue doit exclure les ids done en retard du seed (1, 2, 12, 17, 26)", async () => {
    const response = await request(app).get("/api/tasks/stats")

    expect(response.body.data.overdue).toBe(
      countOverdueExpected(seedTasks)
    )
    expect(response.body.data.overdue).toBe(
      countOverdueExcludingNullDueDate(seedTasks) - DONE_OVERDUE_TASK_IDS.length
    )
  })
})
