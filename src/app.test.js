const request = require("supertest")
const app = require("./app")

describe("app", () => {
  it("devrait renvoyer 404 pour une route inconnue", async () => {
    const response = await request(app).get("/route-inexistante")

    expect(response.status).toBe(404)
    expect(response.body).toEqual({
      success: false,
      error: "Route not found",
    })
  })
})
