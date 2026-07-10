const jwt = require("jsonwebtoken");

// Verifies the Authorization: Bearer <token> header and attaches the
// decoded payload (id, username) to req.user. Use on any REST route that
// shouldn't be reachable by an unauthenticated request.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }
    req.user = decoded; // { id, username }
    next();
  });
}

module.exports = { requireAuth };
