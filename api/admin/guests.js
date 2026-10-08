const store = require("../_lib/store");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }
  if (!store.verifyToken(req.headers.authorization || "")) {
    res.status(401).json({ message: "Please sign in." });
    return;
  }
  try {
    res.status(200).json(store.summary(await store.loadReplies()));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Could not load the guest list." });
  }
};
