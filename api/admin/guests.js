const store = require("../_lib/store");

function readBody(req) {
  const body = req.body || {};
  if (typeof body !== "string") return body;
  try { return JSON.parse(body); } catch (error) { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "DELETE") {
    res.setHeader("Allow", "GET, DELETE");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }
  if (!store.verifyToken(req.headers.authorization || "")) {
    res.status(401).json({ message: "Please sign in." });
    return;
  }
  try {
    if (req.method === "DELETE") {
      res.status(200).json(await store.deleteReply(readBody(req).id));
      return;
    }
    res.status(200).json(store.summary(await store.storedReplies()));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Could not load the guest list." });
  }
};
