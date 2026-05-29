const request = require("supertest")

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

describe("createTask — Bug #5 (validation priority POST)", () => {
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
