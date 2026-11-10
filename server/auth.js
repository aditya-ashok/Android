/*
 * Authentication helpers — password hashing (scrypt) and stateless signed
 * session tokens (HMAC-SHA256). No external dependencies; works the same
 * locally and on Vercel.
 *
 * Set AUTH_SECRET in production to a long random string.
 */
const crypto = require("crypto");

const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  return salt + ":" + hash;
}

function verifyPassword(pw, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const calc = crypto.scryptSync(String(pw), salt, 64).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(calc, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return body + "." + sig;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (expected.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (p.exp && Date.now() > p.exp) return null;
    return p;
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function currentUser(req) {
  let token = parseCookies(req)["nbi_token"];
  const auth = req.headers.authorization;
  if (!token && auth && auth.startsWith("Bearer ")) token = auth.slice(7);
  return verifyToken(token);
}

function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: "Not authenticated" });
  req.user = u;
  next();
}

function requireOwner(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: "Not authenticated" });
  if (u.role !== "owner") return res.status(403).json({ error: "Owner access required" });
  req.user = u;
  next();
}

module.exports = {
  SECRET,
  TOKEN_TTL_MS,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  currentUser,
  requireAuth,
  requireOwner,
};
