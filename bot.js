const express  = require("express");
const cors     = require("cors");
const axios    = require("axios");
const mongoose = require("mongoose");
const app      = express();
 
app.use(cors());
app.use(express.json());
 
const BOT_TOKEN  = "8790609389:AAH419MC4YuZpBLOeKYEVL6h9WxPshEkQRU";
const ADMIN_CHAT = "8495740508";
const PORT       = process.env.PORT || 3000;
const TG         = `https://api.telegram.org/bot${BOT_TOKEN}`;
const MONGO_URI  = process.env.MONGO_URI ||
  "mongodb+srv://admin:8_gMbMCx8K7EkVx@cluster0.unhgtfd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
 
mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(e  => console.error("MongoDB Error:", e.message));
 
// Schema handles: Flash orders, ARB-TOPUP, WITHDRAW
const orderSchema = new mongoose.Schema({
  userId:     { type: String, required: true },
  name:       { type: String, default: "User" },
  username:   { type: String, default: "" },
  plan:       { type: String, required: true }, // STARTER|PRO|ELITE|VIP|ARB-TOPUP|WITHDRAW
  fee:        { type: String, default: "" },
  amount:     { type: String, default: "" },
  userWallet: { type: String, default: "NOT PROVIDED" },
  network:    { type: String, default: "" },
  txid:       { type: String, required: true, unique: true },
  status:     { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  adminNote:  { type: String, default: "" },
  date:       { type: String, default: "" },
  createdAt:  { type: Date, default: Date.now }
});
const Order = mongoose.model("Order", orderSchema);
 
async function tgSend(chatId, text, extra = {}) {
  try {
    await axios.post(`${TG}/sendMessage`, { chat_id: chatId, text, parse_mode: "HTML", ...extra });
  } catch (e) { console.error("TG Error:", e.message); }
}
 
// ═══ WEBHOOK: Admin Approve / Reject ═══
app.post("/webhook", async (req, res) => {
  const u = req.body;
 
  if (u.callback_query) {
    const data   = u.callback_query.data;
    const chatId = String(u.callback_query.message.chat.id);
    const msgId  = u.callback_query.message.message_id;
    const fromId = String(u.callback_query.from.id);
 
    if (chatId !== ADMIN_CHAT && fromId !== ADMIN_CHAT) return res.sendStatus(200);
    if (data === "done") return res.sendStatus(200);
 
    const sepIdx = data.indexOf("_");
    if (sepIdx === -1) return res.sendStatus(200);
    const action = data.substring(0, sepIdx);
    const txid   = data.substring(sepIdx + 1);
    if (!txid || (action !== "approve" && action !== "reject")) return res.sendStatus(200);
 
    try {
      const order = await Order.findOne({ txid });
      if (!order) {
        await tgSend(chatId, `Order not found for TxID:\n<code>${txid}</code>`);
        return res.sendStatus(200);
      }
      if (order.status !== "pending") {
        await tgSend(chatId, `Already processed. Status: <b>${order.status.toUpperCase()}</b>`);
        return res.sendStatus(200);
      }
 
      const isWithdraw = order.plan === "WITHDRAW";
      const isTopup    = order.plan === "ARB-TOPUP";
 
      if (action === "approve") {
        await Order.findOneAndUpdate(
          { txid, status: "pending" },
          { status: "approved", adminNote: isWithdraw ? "Withdrawal processed." : isTopup ? "Balance credited." : "Flash USDT delivery in progress." },
          { new: true }
        );
 
        if (isWithdraw) {
          await tgSend(chatId,
            `WITHDRAWAL APPROVED!\n\n` +
            `User: ${order.name} (@${order.username || "none"})\n` +
            `Amount: ${order.fee}\n` +
            `Network: ${order.network}\n` +
            `USDT sent to:\n<code>${order.userWallet}</code>`
          );
        } else if (isTopup) {
          await tgSend(chatId,
            `BALANCE TOP-UP APPROVED!\n\n` +
            `User: ${order.name} (@${order.username || "none"})\n` +
            `Amount: ${order.fee}\n` +
            `Network: ${order.network}\n` +
            `TxID: <code>${txid}</code>`
          );
        } else {
          await tgSend(chatId,
            `ORDER APPROVED!\n\n` +
            `User: ${order.name} (@${order.username || "none"})\n` +
            `Plan: ${order.plan}\n` +
            `Deliver Flash USDT to:\n<code>${order.userWallet}</code>`
          );
        }
 
        try {
          await axios.post(`${TG}/editMessageReplyMarkup`, {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "APPROVED", callback_data: "done" }]] }
          });
        } catch(e) {}
 
      } else if (action === "reject") {
        await Order.findOneAndUpdate(
          { txid, status: "pending" },
          { status: "rejected", adminNote: "Could not be verified. Please contact support." },
          { new: true }
        );
 
        const typeLabel = isWithdraw ? "WITHDRAWAL" : isTopup ? "TOP-UP" : "ORDER";
        await tgSend(chatId,
          `${typeLabel} REJECTED!\n\n` +
          `User: ${order.name}\n` +
          (isWithdraw || isTopup ? `Amount: ${order.fee}` : `Plan: ${order.plan}`)
        );
 
        try {
          await axios.post(`${TG}/editMessageReplyMarkup`, {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "REJECTED", callback_data: "done" }]] }
          });
        } catch(e) {}
      }
 
    } catch (e) { console.error("Webhook error:", e.message); }
  }
 
  if (u.message && u.message.text === "/start") {
    await tgSend(u.message.chat.id, "German Flash Bot is Online. MongoDB connected.");
  }
  res.sendStatus(200);
});
 
// ═══ POST /api/orders — Flash orders, ARB-TOPUP, WITHDRAW ═══
app.post("/api/orders", async (req, res) => {
  const { userId, name, username, plan, fee, amount, userWallet, network, txid, date } = req.body;
  if (!txid || !plan) return res.status(400).json({ ok: false, error: "Missing txid or plan" });
 
  try {
    const existing = await Order.findOne({ txid });
    if (existing) return res.status(409).json({ ok: false, error: "TxID already submitted." });
 
    await Order.create({ userId: userId || "unknown", name: name || "User", username: username || "",
      plan, fee, amount, userWallet: userWallet || "NOT PROVIDED", network, txid,
      status: "pending", adminNote: "", date: date || new Date().toLocaleDateString() });
 
    const isWithdraw = plan === "WITHDRAW";
    const isTopup    = plan === "ARB-TOPUP";
 
    let msg = "";
    if (isWithdraw) {
      msg = `WITHDRAWAL REQUEST\n\n` +
        `User: ${name} (@${username || "none"})\n` +
        `ID: ${userId}\n` +
        `Amount: ${fee}\n` +
        `Network: ${network}\n` +
        `Send USDT to:\n<code>${userWallet || "NOT PROVIDED"}</code>\n` +
        `Ref: <code>${txid}</code>\n` +
        `Date: ${date}`;
    } else if (isTopup) {
      msg = `BALANCE TOP-UP REQUEST\n\n` +
        `User: ${name} (@${username || "none"})\n` +
        `ID: ${userId}\n` +
        `Amount: ${fee}\n` +
        `Network: ${network}\n` +
        `TxID:\n<code>${txid}</code>\n` +
        `Date: ${date}`;
    } else {
      msg = `NEW ORDER!\n\n` +
        `User: ${name} (@${username || "none"})\n` +
        `ID: ${userId}\n` +
        `Plan: ${plan} | Fee: ${fee}\n` +
        `Receive: ${amount}\n` +
        `Network: ${network}\n` +
        `User Wallet:\n<code>${userWallet || "NOT PROVIDED"}</code>\n` +
        `TxID:\n<code>${txid}</code>\n` +
        `Date: ${date}`;
    }
 
    const approveLabel = isWithdraw ? "Approve Withdrawal" : isTopup ? "Credit Balance" : "Approve";
    await tgSend(ADMIN_CHAT, msg, {
      reply_markup: {
        inline_keyboard: [[
          { text: approveLabel, callback_data: `approve_${txid}` },
          { text: "Reject",    callback_data: `reject_${txid}`  }
        ]]
      }
    });
 
    res.json({ ok: true, success: true });
  } catch (e) {
    console.error("Order error:", e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});
 
// ═══ GET /api/status/:txid ═══
app.get("/api/status/:txid", async (req, res) => {
  try {
    const order = await Order.findOne({ txid: req.params.txid.trim() }, { status: 1, adminNote: 1, _id: 0 });
    if (!order || order.status === "pending") return res.json({ status: "pending", adminNote: "" });
    res.json({ status: order.status, adminNote: order.adminNote || "" });
  } catch (e) { res.json({ status: "pending", adminNote: "" }); }
});
 
// ═══ POST /api/balance (backward compat) ═══
app.post("/api/balance", async (req, res) => {
  const { userId, name, amount, network, txid, date } = req.body;
  if (!txid) return res.status(400).json({ ok: false, error: "Missing txid" });
  await tgSend(ADMIN_CHAT, `BALANCE TOP-UP\nUser: ${name} | $${amount} ${network}\nTxID: <code>${txid}</code>`);
  res.json({ ok: true });
});
 
app.get("/set-webhook", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.send("Add ?url=https://your-app.up.railway.app/webhook");
  try { const r = await axios.post(`${TG}/setWebhook`, { url }); res.send(`Webhook Set! ${JSON.stringify(r.data)}`); }
  catch (e) { res.send("Error: " + e.message); }
});
 
app.get("/", (req, res) => {
  const states = ["disconnected","connected","connecting","disconnecting"];
  res.send(`German Flash Bot | DB: ${states[mongoose.connection.readyState]}`);
});
 
app.listen(PORT, "0.0.0.0", () => console.log(`Server on port ${PORT}`));
 
