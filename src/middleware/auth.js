const VALID_API_KEY = process.env.API_KEY || "secret-key-123"

function authMiddleware(req, res, next) {
  const apiKey = req.headers["x-api-key"]

  if (!apiKey || apiKey !== VALID_API_KEY) {
    return res.status(401).json({
      success: false,
      error: "Unauthorized: invalid or missing API key",
    })
  }

  next()
}

module.exports = authMiddleware
