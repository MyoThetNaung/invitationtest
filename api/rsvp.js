const store = require("./_lib/store");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }
  try {
    const saved = await store.saveReply(req.body);
    res.status(200).json(saved);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Could not save the reply." });
  }
};
