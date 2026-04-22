const express  = require("express");
const cors     = require("cors");
const axios    = require("axios");
const mongoose = require("mongoose");
const app      = express();
 
app.use(cors());
app.use(express.json());
 
// ─── CONFIG ───
const BOT_TOKEN  = "8790609389:AAH419MC4YuZpBLOeKYEVL6h9WxPshEkQRU";
const ADMIN_CHAT = "8495740508";
const PORT       = process.env.PORT || 3000;
const TG         = `https://api.telegram.org/bot${BOT_TOKEN}`;
const MONGO_URI  = process.env.MONGO_URI ||
  "mongodb+srv://admin:8_gMbMCx8K7EkVx@cluster0.unhgtfd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
 
// ═══════════════════════════════════════════════
// MONGOOSE — Connect to MongoDB Atlas
// ═══════════════════════════════════════════════
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(e  => console.error("❌ MongoDB Error:", e.message));
 
// ═══════════════════════════════════════════════
// ORDER SCHEMA & MODEL
// ═══════════════════════════════════════════════
const orderSchema = new mongoose.Schema({
  userId:     { type: String, required: true },
  name:       { type: String, default: "User" },
  username:   { type: String, default: "" },
  plan:       { type: String, required: true },
  fee:        { type: String, default: "" },
  amount:     { type: String, default: "" },
  userWallet: { type: String, default: "NOT PROVIDED" },
  network:    { type: String, default: "" },
  txid:       { type: String, required: true, unique: true },
  status:     { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  adminNote:  { type: String, default: "" },
  date:       { type: String, default: "" },
  createdAt:  { type: Date,   default: Date.now }
});
 
const Order = mongoose.model("Order", orderSchema);
 
// ─── TELEGRAM SEND HELPER ───
async function tgSend(chatId, text, extra = {}) {
  try {
    await axios.post(`${TG}/sendMessage`, {
      chat_id: chatId, text, parse_mode: "HTML", ...extra
    });
  } catch (e) { console.error("TG Send Error:", e.message); }
}
 
// ═══════════════════════════════════════════════
// WEBHOOK — Approve / Reject button handler
// ═══════════════════════════════════════════════
app.post("/webhook", async (req, res) => {
  const u = req.body;
 
  if (u.callback_query) {
    const data      = u.callback_query.data;
    const chatId    = String(u.callback_query.message.chat.id);
    const msgId     = u.callback_query.message.message_id;
    const fromId    = String(u.callback_query.from.id);
 
    // ══════════════════════════════════════════
    // SECURITY FIX #1:
    // ONLY admin can approve/reject orders.
    // If callback is from anyone else → ignore silently.
    // Ye wajah thi k orders auto-approve ho rahe the —
    // koi bhi callback send kar ke approve kar sakta tha.
    // ══════════════════════════════════════════
    if (chatId !== ADMIN_CHAT && fromId !== ADMIN_CHAT) {
      console.warn(`⛔ Unauthorized callback from chatId=${chatId}, fromId=${fromId}. Ignored.`);
      return res.sendStatus(200);
    }
 
    if (data === "done") return res.sendStatus(200);
 
    // Parse action and txid from callback data
    const sepIdx = data.indexOf("_");
    if (sepIdx === -1) return res.sendStatus(200); // malformed callback
 
    const action = data.substring(0, sepIdx);   // "approve" or "reject"
    const txid   = data.substring(sepIdx + 1);  // full txid string
 
    // Only process known actions
    if (action !== "approve" && action !== "reject") {
      console.warn(`Unknown action: ${action}`);
      return res.sendStatus(200);
    }
 
    if (!txid || txid.trim() === "") {
      console.warn("Empty txid in callback");
      return res.sendStatus(200);
    }
 
    try {
      const order = await Order.findOne({ txid });
 
      if (!order) {
        await tgSend(chatId,
          `⚠️ Order not found for TxID:\n<code>${txid}</code>`
        );
        return res.sendStatus(200);
      }
 
      // ══════════════════════════════════════════
      // SECURITY FIX #2:
      // Order sirf ek baar approve/reject ho sakta hai.
      // Duplicate ya queued Telegram retries ignore hon ge.
      // ══════════════════════════════════════════
      if (order.status !== "pending") {
        await tgSend(chatId,
          `ℹ️ Is order par pehle hi action ho chuka hai.\nStatus: <b>${order.status.toUpperCase()}</b>`
        );
        return res.sendStatus(200);
      }
 
      if (action === "approve") {
        // ══════════════════════════════════════════
        // ONLY mark approved if order is currently pending
        // Double check karo pehle DB se
        // ══════════════════════════════════════════
        const updated = await Order.findOneAndUpdate(
          { txid, status: "pending" }, // condition: sirf pending order update ho
          { status: "approved", adminNote: "Flash USDT delivery in progress." },
          { new: true }
        );
 
        if (!updated) {
          await tgSend(chatId, `⚠️ Order already processed or not found.`);
          return res.sendStatus(200);
        }
 
        await tgSend(chatId,
          `✅ APPROVED!\n\n` +
          `User: ${order.name} (@${order.username || "none"})\n` +
          `Plan: ${order.plan}\n` +
          `Deliver Flash USDT to:\n<code>${order.userWallet}</code>`
        );
 
        // Update button to show APPROVED
        try {
          await axios.post(`${TG}/editMessageReplyMarkup`, {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "✅ APPROVED", callback_data: "done" }]] }
          });
        } catch(e) {}
 
      } else if (action === "reject") {
        // Same double-check for reject
        const updated = await Order.findOneAndUpdate(
          { txid, status: "pending" }, // condition: sirf pending order update ho
          { status: "rejected", adminNote: "TxID could not be verified. Please contact support." },
          { new: true }
        );
 
        if (!updated) {
          await tgSend(chatId, `⚠️ Order already processed or not found.`);
          return res.sendStatus(200);
        }
 
        await tgSend(chatId,
          `❌ REJECTED!\n\nUser: ${order.name}\nPlan: ${order.plan}`
        );
 
        // Update button to show REJECTED
        try {
          await axios.post(`${TG}/editMessageReplyMarkup`, {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "❌ REJECTED", callback_data: "done" }]] }
          });
        } catch(e) {}
      }
 
    } catch (e) {
      console.error("Webhook processing error:", e.message);
    }
  }
 
  if (u.message && u.message.text === "/start") {
    await tgSend(u.message.chat.id, "✅ German Flash Bot is Online. MongoDB connected.");
  }
 
  res.sendStatus(200);
});
 
// ═══════════════════════════════════════════════
// POST /order — Save new order + notify admin
// ═══════════════════════════════════════════════
app.post("/order", async (req, res) => {
  const { userId, name, username, plan, fee, amount, userWallet, network, txid, date } = req.body;
 
  if (!txid || !plan) {
    return res.status(400).json({ ok: false, error: "Missing txid or plan" });
  }
 
  try {
    // Block duplicate TxID
    const existing = await Order.findOne({ txid });
    if (existing) {
      return res.status(409).json({
        ok: false,
        error: "This TxID already submitted. Check your order history."
      });
    }
 
    // Save to MongoDB — always as PENDING
    await Order.create({
      userId:     userId     || "unknown",
      name:       name       || "User",
      username:   username   || "",
      plan, fee, amount,
      userWallet: userWallet || "NOT PROVIDED",
      network, txid,
      status:    "pending",   // ALWAYS pending on create
      adminNote: "",
      date:      date || new Date().toLocaleDateString()
    });
 
    // Send to Telegram admin
    const msg =
      `🔔 <b>NEW ORDER!</b>\n\n` +
      `👤 User: ${name} (@${username || "none"})\n` +
      `🆔 ID: ${userId}\n` +
      `📦 Plan: ${plan} | Fee: ${fee}\n` +
      `💰 Receive: ${amount}\n` +
      `🌐 Network: ${network}\n` +
      `👛 User Wallet:\n<code>${userWallet || "NOT PROVIDED"}</code>\n` +
      `🔑 TxID:\n<code>${txid}</code>\n` +
      `📅 Date: ${date}`;
 
    await tgSend(ADMIN_CHAT, msg, {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `approve_${txid}` },
          { text: "❌ Reject",  callback_data: `reject_${txid}`  }
        ]]
      }
    });
 
    res.json({ ok: true, success: true });
 
  } catch (e) {
    console.error("Order create error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});
 
// ═══════════════════════════════════════════════
// GET /status/:txid — Frontend polls every 10s
// ══════════════════════════════════════════════
// IMPORTANT FIX:
// Sirf "approved" ya "rejected" return karo jab admin
// ne explicitly DB update kiya ho.
// Kisi bhi error ya not-found case mein "pending" return karo.
// ═══════════════════════════════════════════════
app.get("/status/:txid", async (req, res) => {
  try {
    const txid = req.params.txid;
    if (!txid || txid.trim() === "") {
      return res.json({ status: "pending", adminNote: "" });
    }
 
    const order = await Order.findOne(
      { txid: txid.trim() },
      { status: 1, adminNote: 1, _id: 0 }
    );
 
    // Order nahi mila → pending
    if (!order) {
      return res.json({ status: "pending", adminNote: "" });
    }
 
    // SAFETY: sirf "approved" ya "rejected" status bhejo
    // koi aur value → pending treat karo
    if (order.status !== "approved" && order.status !== "rejected") {
      return res.json({ status: "pending", adminNote: "" });
    }
 
    res.json({ status: order.status, adminNote: order.adminNote || "" });
 
  } catch (e) {
    // DB error → always return pending (NEVER auto-approve on error)
    console.error("Status check error:", e.message);
    res.json({ status: "pending", adminNote: "" });
  }
});
 
// ═══════════════════════════════════════════════
// POST /balance — Arbitrage wallet top-up
// ═══════════════════════════════════════════════
app.post("/balance", async (req, res) => {
  const { userId, name, amount, network, txid, date } = req.body;
  if (!txid) return res.status(400).json({ ok: false, error: "Missing txid" });
 
  await tgSend(ADMIN_CHAT,
    `💳 <b>BALANCE TOP-UP</b>\n\n` +
    `👤 User: ${name} | ID: ${userId}\n` +
    `💰 Amount: $${amount} ${network}\n` +
    `🔑 TxID: <code>${txid}</code>\n` +
    `📅 Date: ${date}`
  );
  res.json({ ok: true });
});
 
// ═══════════════════════════════════════════════
// GET /set-webhook — One-time setup helper
// ═══════════════════════════════════════════════
app.get("/set-webhook", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.send("Add ?url=https://your-app.up.railway.app/webhook");
  try {
    const r = await axios.post(`${TG}/setWebhook`, { url });
    res.send(`✅ Webhook Set! ${JSON.stringify(r.data)}`);
  } catch (e) { res.send("Error: " + e.message); }
});
 
// ─── Health check ───
app.get("/", (req, res) => {
  const states = ["disconnected","connected","connecting","disconnecting"];
  res.send(`✅ German Flash Bot Running | DB: ${states[mongoose.connection.readyState]}`);
});
 
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server on port ${PORT}`));
