const crypto = require("node:crypto");

const REDIS_KEY = "wedding:rsvps";

function password() {
  return process.env.ADMIN_PASSWORD || "garden2027";
}

function redisUrl() {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
}

function redisToken() {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
}

function cleanText(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function signToken() {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const sig = crypto.createHmac("sha256", password()).update(body).digest("base64url");
  return body + "." + sig;
}

function verifyToken(header) {
  if (!header || !header.startsWith("Bearer ")) return false;
  const parts = header.slice(7).trim().split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", password()).update(parts[0]).digest("base64url");
  const actual = Buffer.from(parts[1]);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length || !crypto.timingSafeEqual(actual, wanted)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return payload.exp > Date.now();
  } catch (error) {
    return false;
  }
}

async function redis(command) {
  const response = await fetch(redisUrl(), {
    method: "POST",
    headers: {
      Authorization: "Bearer " + redisToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error || "Redis request failed");
  }
  return data.result;
}

async function loadReplies() {
  if (!redisUrl() || !redisToken()) {
    const error = new Error("Add Upstash Redis to this Vercel project.");
    error.status = 503;
    throw error;
  }
  const raw = await redis(["GET", REDIS_KEY]);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveReplies(replies) {
  await redis(["SET", REDIS_KEY, JSON.stringify(replies)]);
}

function upsert(replies, record) {
  const key = record.name.toLowerCase();
  const next = replies.slice();
  const index = next.findIndex(function (item) {
    return String(item.name || "").toLowerCase() === key;
  });
  if (index >= 0) next[index] = record;
  else next.push(record);
  return next;
}

function buildRecord(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("Please send a reply.");
    error.status = 400;
    throw error;
  }
  const name = cleanText(body.name, 80);
  const attending = body.attending;
  const note = cleanText(body.note, 400);
  if ((attending !== "yes" && attending !== "no") || name.length < 2) {
    const error = new Error("Please include your name and whether you can come.");
    error.status = 400;
    throw error;
  }
  let guests = 0;
  if (attending === "yes") {
    guests = Number(body.guests);
    if (!Number.isInteger(guests) || guests < 1 || guests > 8) {
      const error = new Error("Please choose how many guests will come.");
      error.status = 400;
      throw error;
    }
  }
  return { name: name, attending: attending, guests: guests, note: note };
}

function summary(replies) {
  const coming = replies.filter(function (item) { return item.attending === "yes"; });
  const declined = replies.filter(function (item) { return item.attending === "no"; });
  return {
    coming: coming,
    declined: declined,
    totalComing: coming.reduce(function (sum, item) { return sum + Number(item.guests || 0); }, 0),
    partiesComing: coming.length,
    partiesDeclined: declined.length,
  };
}

async function saveReply(body) {
  const record = buildRecord(body);
  const replies = upsert(await loadReplies(), record);
  await saveReplies(replies);
  return record;
}

module.exports = {
  password: password,
  signToken: signToken,
  verifyToken: verifyToken,
  buildRecord: buildRecord,
  upsert: upsert,
  summary: summary,
  saveReply: saveReply,
  loadReplies: loadReplies,
};
