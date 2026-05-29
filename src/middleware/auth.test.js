const request = require("supertest")
const express = require("express")
const authMiddleware = require("./auth")

/**
 * Bug #1 (corrigé) — Authentification via `x-api-key` (README).
 * npm test -- --testPathPattern=auth.test.js
 */

function createProtectedApp() {
  const app = express()
  app.get("/protected", authMiddleware, (req, res) => {
    res.status(200).json({ success: true, message: "authorized" })
  })
  return app
}

describe("authMiddleware — header x-api-key (README)", () => {
  let req
  let res
  let next

  beforeEach(() => {
    req = { headers: {} }
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    next = jest.fn()
  })

  describe("comportement attendu avec x-api-key", () => {
    it("devrait appeler next() lorsque x-api-key est valide", () => {
      req.headers["x-api-key"] = "secret-key-123"

      authMiddleware(req, res, next)

      expect(next).toHaveBeenCalledTimes(1)
      expect(res.status).not.toHaveBeenCalled()
      expect(res.json).not.toHaveBeenCalled()
    })

    it("devrait autoriser GET /protected avec x-api-key valide (intégration)", async () => {
      const app = createProtectedApp()

      const response = await request(app)
        .get("/protected")
        .set("x-api-key", "secret-key-123")

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        message: "authorized",
      })
    })

    it("devrait autoriser GET /api/tasks avec x-api-key valide (intégration app)", async () => {
      const app = require("../app")

      const response = await request(app)
        .get("/api/tasks")
        .set("x-api-key", "secret-key-123")

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(Array.isArray(response.body.data)).toBe(true)
    })
  })

  describe("rejets 401 avec x-api-key ou sans header", () => {
    const unauthorizedBody = {
      success: false,
      error: "Unauthorized: invalid or missing API key",
    }

    it("devrait retourner 401 sans aucun header d'authentification", () => {
      authMiddleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(unauthorizedBody)
    })

    it("devrait retourner 401 lorsque x-api-key est invalide", () => {
      req.headers["x-api-key"] = "mauvaise-cle"

      authMiddleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(unauthorizedBody)
    })

    it("devrait retourner 401 lorsque x-api-key est vide", () => {
      req.headers["x-api-key"] = ""

      authMiddleware(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(401)
      expect(res.json).toHaveBeenCalledWith(unauthorizedBody)
    })

    it("devrait retourner 401 sur GET /protected sans header (intégration)", async () => {
      const app = createProtectedApp()

      const response = await request(app).get("/protected")

      expect(response.status).toBe(401)
      expect(response.body).toEqual(unauthorizedBody)
    })

    it("devrait retourner 401 sur GET /protected avec x-api-key invalide (intégration)", async () => {
      const app = createProtectedApp()

      const response = await request(app)
        .get("/protected")
        .set("x-api-key", "mauvaise-cle")

      expect(response.status).toBe(401)
      expect(response.body).toEqual(unauthorizedBody)
    })

    it("devrait retourner 401 sur GET /api/tasks sans header (intégration app)", async () => {
      const app = require("../app")

      const response = await request(app).get("/api/tasks")

      expect(response.status).toBe(401)
      expect(response.body).toEqual(unauthorizedBody)
    })
  })
})

describe("authMiddleware — variable d'environnement API_KEY", () => {
  const originalApiKey = process.env.API_KEY

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.API_KEY
    } else {
      process.env.API_KEY = originalApiKey
    }
    jest.resetModules()
  })

  it("devrait utiliser process.env.API_KEY quand elle est définie", () => {
    process.env.API_KEY = "cle-personnalisee"
    jest.resetModules()

    const authWithCustomKey = require("./auth")
    const req = { headers: { "x-api-key": "cle-personnalisee" } }
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    const next = jest.fn()

    authWithCustomKey(req, res, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it("devrait rejeter la clé par défaut quand API_KEY personnalisée est définie", () => {
    process.env.API_KEY = "cle-personnalisee"
    jest.resetModules()

    const authWithCustomKey = require("./auth")
    const req = { headers: { "x-api-key": "secret-key-123" } }
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    const next = jest.fn()

    authWithCustomKey(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })
})
