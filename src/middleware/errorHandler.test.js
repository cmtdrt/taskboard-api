const express = require("express")
const request = require("supertest")
const errorHandler = require("./errorHandler")

// Pour lancer les tests, il faut faire :
// npm test -- --testPathPattern=errorHandler.test.js

describe("errorHandler", () => {
  let req
  let res
  let next
  let consoleErrorSpy

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    req = {}
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    }
    next = jest.fn()
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe("tests unitaires", () => {
    it("devrait logger err.stack et répondre avec status et message de l'erreur", () => {
      const err = Object.assign(new Error("Ressource introuvable"), { status: 404 })

      errorHandler(err, req, res, next)

      expect(consoleErrorSpy).toHaveBeenCalledWith(err.stack)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Ressource introuvable",
      })
      expect(next).not.toHaveBeenCalled()
    })

    it("devrait utiliser le status 500 par défaut si err.status est absent", () => {
      const err = new Error("Erreur serveur")

      errorHandler(err, req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Erreur serveur",
      })
    })

    it("devrait utiliser le message par défaut si err.message est vide", () => {
      const err = Object.assign(new Error(""), { status: 502 })

      errorHandler(err, req, res, next)

      expect(res.status).toHaveBeenCalledWith(502)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      })
    })

    it("devrait utiliser status 500 et message par défaut pour une erreur minimale", () => {
      const err = { message: undefined }

      errorHandler(err, req, res, next)

      expect(res.status).toHaveBeenCalledWith(500)
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: "Internal server error",
      })
    })
  })

  describe("intégration Express", () => {
    function createAppWithErrorRoute(throwError) {
      const app = express()
      app.get("/trigger-error", (req, res, next) => {
        throwError(next)
      })
      app.use(errorHandler)
      return app
    }

    it("devrait renvoyer la réponse JSON via next(err) dans une app Express", async () => {
      const app = createAppWithErrorRoute((next) => {
        const err = Object.assign(new Error("Validation échouée"), { status: 400 })
        next(err)
      })

      const response = await request(app).get("/trigger-error")

      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        success: false,
        error: "Validation échouée",
      })
    })

    it("devrait gérer une erreur synchrone non attrapée propagée au middleware", async () => {
      const app = express()
      app.get("/sync-error", () => {
        throw new Error("Crash synchrone")
      })
      app.use(errorHandler)

      const response = await request(app).get("/sync-error")

      expect(response.status).toBe(500)
      expect(response.body).toEqual({
        success: false,
        error: "Crash synchrone",
      })
    })
  })
})
