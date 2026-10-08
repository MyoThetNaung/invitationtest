const store = require("../_lib/store");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ message: "Method not allowed" });
    return;
  }
  const body = req.body || {};
  if (body.password !== store.password()) {
    res.status(401).json({ message: "That password is not right." });
    return;
  }
  res.status(200).json({ token: store.signToken() });
};
