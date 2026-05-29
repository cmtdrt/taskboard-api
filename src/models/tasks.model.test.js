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
 * Bug #2 — Filtre priority : casse (README `high`) + `==` au lieu de `===`.
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
