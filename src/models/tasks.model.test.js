const fs = require("fs")
const path = require("path")
const request = require("supertest")

const seedPath = path.join(__dirname, "../../data/seed.json")
const seedTasks = JSON.parse(fs.readFileSync(seedPath, "utf-8"))

const API_KEY = "secret-key-123"

function countSeedByPriority(priority) {
  return seedTasks.filter((t) => t.priority === priority).length
}

function loadFreshModel() {
  jest.resetModules()
  return require("./tasks.model")
}

/**
 * Bug #2 (corrigé) — Filtre priority : casse insensible + comparaison stricte sur string.
 * npm test -- --testPathPattern=tasks.model.test.js
 */
describe("TaskModel.findAll — Bug #2 (filtre priority)", () => {
  let TaskModel

  beforeEach(() => {
    TaskModel = loadFreshModel()
  })

  describe("casse insensible (comportement attendu / README)", () => {
    it("devrait filtrer avec priority=high comme HIGH (seed)", () => {
      const result = TaskModel.findAll({ priority: "high" })
      const expected = countSeedByPriority("HIGH")

      expect(expected).toBeGreaterThan(0)
      expect(result).toHaveLength(expected)
      expect(result.every((t) => t.priority === "HIGH")).toBe(true)
    })

    it("devrait filtrer avec priority=medium comme MEDIUM (seed)", () => {
      const result = TaskModel.findAll({ priority: "medium" })
      const expected = countSeedByPriority("MEDIUM")

      expect(expected).toBeGreaterThan(0)
      expect(result).toHaveLength(expected)
      expect(result.every((t) => t.priority === "MEDIUM")).toBe(true)
    })

    it("devrait filtrer avec priority=low comme LOW (seed)", () => {
      const result = TaskModel.findAll({ priority: "low" })
      const expected = countSeedByPriority("LOW")

      expect(expected).toBeGreaterThan(0)
      expect(result).toHaveLength(expected)
      expect(result.every((t) => t.priority === "LOW")).toBe(true)
    })

    it("devrait accepter un mélange de casse (ex. HiGh)", () => {
      const result = TaskModel.findAll({ priority: "HiGh" })
      const expected = countSeedByPriority("HIGH")

      expect(result).toHaveLength(expected)
    })
  })

  describe("égalité stricte === (pas de coercition avec ==)", () => {
    it("ne doit pas faire correspondre une priorité numérique 0 au filtre chaîne \"0\"", () => {
      TaskModel.update(7, { priority: 0 })

      const task = TaskModel.findById(7)
      expect(task.priority).toBe(0)

      const result = TaskModel.findAll({ priority: "0" })

      expect(result).toHaveLength(0)
    })

    it("ne doit pas faire correspondre une priorité numérique 1 au filtre chaîne \"1\"", () => {
      TaskModel.create({
        title: "Autre priorité numérique",
        priority: 1,
      })

      const result = TaskModel.findAll({ priority: "1" })

      expect(result).toHaveLength(0)
    })
  })

  describe("référence — filtre exact en majuscules (passe avec le code actuel)", () => {
    it("devrait filtrer avec priority=HIGH", () => {
      const result = TaskModel.findAll({ priority: "HIGH" })
      const expected = countSeedByPriority("HIGH")

      expect(result).toHaveLength(expected)
    })
  })
})

describe("GET /api/tasks?priority= — Bug #2 (intégration)", () => {
  const app = require("../app")

  it("devrait renvoyer les tâches HIGH avec ?priority=high (README)", async () => {
    const expected = countSeedByPriority("HIGH")

    const response = await request(app)
      .get("/api/tasks")
      .query({ priority: "high" })
      .set("x-api-key", API_KEY)

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.data).toHaveLength(expected)
    expect(response.body.data.every((t) => t.priority === "HIGH")).toBe(true)
  })

  it("devrait renvoyer les tâches MEDIUM avec ?priority=medium", async () => {
    const expected = countSeedByPriority("MEDIUM")

    const response = await request(app)
      .get("/api/tasks")
      .query({ priority: "medium" })
      .set("x-api-key", API_KEY)

    expect(response.status).toBe(200)
    expect(response.body.data).toHaveLength(expected)
  })

  it("ne doit pas inclure une tâche dont priority=0 (nombre) quand ?priority=0 (chaîne)", async () => {
    await request(app)
      .put("/api/tasks/7")
      .set("x-api-key", API_KEY)
      .send({ priority: 0 })

    const response = await request(app)
      .get("/api/tasks")
      .query({ priority: "0" })
      .set("x-api-key", API_KEY)

    expect(response.status).toBe(200)
    expect(response.body.data.some((t) => t.id === 7)).toBe(false)
  })
})

/**
 * Bug #10 (corrigé) — id : entier strict (plus de parseInt partiel).
 * npm test -- --testPathPattern=tasks.model.test.js
 */
describe("TaskModel — Bug #10 (corrigé — id entier strict)", () => {
  let TaskModel

  beforeEach(() => {
    TaskModel = loadFreshModel()
  })

  describe("comportement attendu — findById", () => {
    it.each(["12abc", "1.9", "0x10", "abc", ""])(
      "ne doit pas résoudre un id invalide : %j",
      (id) => {
        expect(TaskModel.findById(id)).toBeUndefined()
      }
    )

    it("devrait trouver une tâche avec un id numérique valide", () => {
      const task = TaskModel.findById("12")
      expect(task).toBeDefined()
      expect(task.id).toBe(12)
    })
  })

  describe("comportement attendu — update / delete", () => {
    it("update doit retourner null pour un id invalide", () => {
      expect(TaskModel.update("12abc", { title: "hack" })).toBeNull()
    })

    it("delete doit retourner null pour un id invalide", () => {
      expect(TaskModel.delete("1.9")).toBeNull()
    })
  })
})

describe("Routes /api/tasks/:id — Bug #10 (intégration)", () => {
  let app

  beforeEach(() => {
    jest.resetModules()
    app = require("../app")
  })

  const auth = { "x-api-key": API_KEY }

  it.each([
    ["GET", "/api/tasks/12abc", null],
    ["GET", "/api/tasks/1.9", null],
    ["PUT", "/api/tasks/12abc", { title: "x" }],
    ["PATCH", "/api/tasks/1.9/move", { status: "todo" }],
    ["DELETE", "/api/tasks/0x10", null],
  ])("%s %s doit renvoyer 404 pour id invalide", async (method, url, body) => {
    const req = request(app)[method.toLowerCase()](url).set(auth)
    const response = body ? await req.send(body) : await req

    expect(response.status).toBe(404)
    expect(response.body.success).toBe(false)
    expect(response.body.error).toBe("Task not found")
  })

  it("GET /api/tasks/12 doit renvoyer la tâche 12 (référence)", async () => {
    const response = await request(app).get("/api/tasks/12").set(auth)

    expect(response.status).toBe(200)
    expect(response.body.data.id).toBe(12)
  })

  it("ne doit pas modifier la tâche 12 via PUT sur /api/tasks/12abc", async () => {
    const before = await request(app).get("/api/tasks/12").set(auth)
    const originalTitle = before.body.data.title

    await request(app)
      .put("/api/tasks/12abc")
      .set(auth)
      .send({ title: "Titre piraté" })

    const after = await request(app).get("/api/tasks/12").set(auth)

    expect(after.body.data.title).toBe(originalTitle)
  })
})
