const express  = require("express"); //[cite: 2]
const cors     = require("cors"); //[cite: 2]
const axios    = require("axios"); //[cite: 2]
const mongoose = require("mongoose"); //[cite: 2]
const app      = express(); //[cite: 2]

app.use(cors()); //[cite: 2]
app.use(express.json()); //[cite: 2]

const BOT_TOKEN  = "8790609389:AAH419MC4YuZpBLOeKYEVL6h9WxPshEkQRU"; //[cite: 2]
const ADMIN_CHAT = "8495740508"; //[cite: 2]
const PORT       = process.env.PORT || 3000; //[cite: 2]
const TG         = `https://api.telegram.org/bot${BOT_TOKEN}`; //[cite: 2]
const MONGO_URI  = process.env.MONGO_URI ||
  "mongodb+srv://admin:8_gMbMCx8K7EkVx@cluster0.unhgtfd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"; //[cite: 2]

mongoose.connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected")) //[cite: 2]
  .catch(e  => console.error("MongoDB Error:", e.message)); //[cite: 2]

// Schema handles: Flash orders, ARB-TOPUP, WITHDRAW
const orderSchema = new mongoose.Schema({
  userId:     { type: String, required: true }, //[cite: 2]
  name:       { type: String, default: "User" }, //[cite: 2]
  username:   { type: String, default: "" }, //[cite: 2]
  plan:       { type: String, required: true }, //[cite: 2]
  fee:        { type: String, default: "" }, //[cite: 2]
  amount:     { type: String, default: "" }, //[cite: 2]
  userWallet: { type: String, default: "NOT PROVIDED" }, //[cite: 2]
  network:    { type: String, default: "" }, //[cite: 2]
  txid:       { type: String, required: true, unique: true }, //[cite: 2]
  status:     { type: String, enum: ["pending","approved","rejected"], default: "pending" }, //[cite: 2]
  adminNote:  { type: String, default: "" }, //[cite: 2]
  date:       { type: String, default: "" }, //[cite: 2]
  createdAt:  { type: Date, default: Date.now } //[cite: 2]
});
const Order = mongoose.model("Order", orderSchema); //[cite: 2]

async function tgSend(chatId, text, extra = {}) {
  try {
    await axios.post(`${TG}/sendMessage`, { chat_id: chatId, text, parse_mode: "HTML", ...extra }); //[cite: 2]
  } catch (e) { console.error("TG Error:", e.message); } //[cite: 2]
}

// ═══ WEBHOOK: Admin Approve / Reject ═══
app.post("/webhook", async (req, res) => { //[cite: 2]
  const u = req.body; //[cite: 2]

  if (u.callback_query) { //[cite: 2]
    const data   = u.callback_query.data; //[cite: 2]
    const chatId = String(u.callback_query.message.chat.id); //[cite: 2]
    const msgId  = u.callback_query.message.message_id; //[cite: 2]
    const fromId = String(u.callback_query.from.id); //[cite: 2]

    if (chatId !== ADMIN_CHAT && fromId !== ADMIN_CHAT) return res.sendStatus(200); //[cite: 2]
    if (data === "done") return res.sendStatus(200); //[cite: 2]

    const sepIdx = data.indexOf("_"); //[cite: 2]
    if (sepIdx === -1) return res.sendStatus(200); //[cite: 2]
    const action = data.substring(0, sepIdx); //[cite: 2]
    const txid   = data.substring(sepIdx + 1); //[cite: 2]
    if (!txid || (action !== "approve" && action !== "reject")) return res.sendStatus(200); //[cite: 2]

    try {
      const order = await Order.findOne({ txid }); //[cite: 2]
      if (!order) {
        await tgSend(chatId, `Order not found for TxID:\n<code>${txid}</code>`); //[cite: 2]
        return res.sendStatus(200); //[cite: 2]
      }
      if (order.status !== "pending") {
        await tgSend(chatId, `Already processed. Status: <b>${order.status.toUpperCase()}</b>`); //[cite: 2]
        return res.sendStatus(200); //[cite: 2]
      }

      const isWithdraw = order.plan === "WITHDRAW"; //[cite: 2]
      const isTopup    = order.plan === "ARB-TOPUP"; //[cite: 2]

      if (action === "approve") {
        await Order.findOneAndUpdate(
          { txid, status: "pending" }, //[cite: 2]
          { status: "approved", adminNote: isWithdraw ? "Withdrawal processed." : isTopup ? "Balance credited." : "Flash USDT delivery in progress." }, //[cite: 2]
          { new: true } //[cite: 2]
        );

        if (isWithdraw) {
          await tgSend(chatId,
            `WITHDRAWAL APPROVED!\n\n` +
            `User: ${order.name} (@${order.username || "none"})\n` +
            `Amount: ${order.fee}\n` +
            `Network: ${order.network}\n` +
            `USDT sent to:\n<code>${order.userWallet}</code>` //[cite: 2]
          );
        } else if (isTopup) {
          await tgSend(chatId,
            `BALANCE TOP-UP APPROVED!\n\n` +
            `User: ${order.name} (@${order.username || "none"})\n` +
            `Amount: ${order.fee}\n` +
            `Network: ${order.network}\n` +
            `TxID: <code>${txid}</code>` //[cite: 2]
          );
        } else {
          await tgSend(chatId,
            `ORDER APPROVED!\n\n` +
            `User: ${order.name} (@${order.username || "none"})\n` +
            `Plan: ${order.plan}\n` +
            `Deliver Flash USDT to:\n<code>${order.userWallet}</code>` //[cite: 2]
          );
        }

        try {
          await axios.post(`${TG}/editMessageReplyMarkup`, {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "APPROVED", callback_data: "done" }]] } //[cite: 2]
          });
        } catch(e) {}

      } else if (action === "reject") {
        await Order.findOneAndUpdate(
          { txid, status: "pending" }, //[cite: 2]
          { status: "rejected", adminNote: "Could not be verified. Please contact support." }, //[cite: 2]
          { new: true } //[cite: 2]
        );

        const typeLabel = isWithdraw ? "WITHDRAWAL" : isTopup ? "TOP-UP" : "ORDER"; //[cite: 2]
        await tgSend(chatId,
          `${typeLabel} REJECTED!\n\n` +
          `User: ${order.name}\n` +
          (isWithdraw || isTopup ? `Amount: ${order.fee}` : `Plan: ${order.plan}`) //[cite: 2]
        );

        try {
          await axios.post(`${TG}/editMessageReplyMarkup`, {
            chat_id: chatId, message_id: msgId,
            reply_markup: { inline_keyboard: [[{ text: "REJECTED", callback_data: "done" }]] } //[cite: 2]
          });
        } catch(e) {}
      }

    } catch (e) { console.error("Webhook error:", e.message); } //[cite: 2]
  }

  if (u.message && u.message.text === "/start") { //[cite: 2]
    await tgSend(u.message.chat.id, "German Flash Bot is Online. MongoDB connected."); //[cite: 2]
  }
  res.sendStatus(200); //[cite: 2]
});

// ═══ POST /api/orders — Flash orders, ARB-TOPUP, WITHDRAW ═══
app.post("/api/orders", async (req, res) => { //[cite: 2]
  const { userId, name, username, plan, fee, amount, userWallet, network, txid, date } = req.body; //[cite: 2]
  if (!txid || !plan) return res.status(400).json({ ok: false, error: "Missing txid or plan" }); //[cite: 2]

  try {
    const existing = await Order.findOne({ txid }); //[cite: 2]
    if (existing) return res.status(409).json({ ok: false, error: "TxID already submitted." }); //[cite: 2]

    await Order.create({ userId: userId || "unknown", name: name || "User", username: username || "",
      plan, fee, amount, userWallet: userWallet || "NOT PROVIDED", network, txid,
      status: "pending", adminNote: "", date: date || new Date().toLocaleDateString() }); //[cite: 2]

    const isWithdraw = plan === "WITHDRAW"; //[cite: 2]
    const isTopup    = plan === "ARB-TOPUP"; //[cite: 2]

    let msg = ""; //[cite: 2]
    if (isWithdraw) {
      msg = `WITHDRAWAL REQUEST\n\n` +
        `User: ${name} (@${username || "none"})\n` +
        `ID: ${userId}\n` +
        `Amount: ${fee}\n` +
        `Network: ${network}\n` +
        `Send USDT to:\n<code>${userWallet || "NOT PROVIDED"}</code>\n` +
        `Ref: <code>${txid}</code>\n` +
        `Date: ${date}`; //[cite: 2]
    } else if (isTopup) {
      msg = `BALANCE TOP-UP REQUEST\n\n` +
        `User: ${name} (@${username || "none"})\n` +
        `ID: ${userId}\n` +
        `Amount: ${fee}\n` +
        `Network: ${network}\n` +
        `TxID:\n<code>${txid}</code>\n` +
        `Date: ${date}`; //[cite: 2]
    } else {
      msg = `NEW ORDER!\n\n` +
        `User: ${name} (@${username || "none"})\n` +
        `ID: ${userId}\n` +
        `Plan: ${plan} | Fee: ${fee}\n` +
        `Receive: ${amount}\n` +
        `Network: ${network}\n` +
        `User Wallet:\n<code>${userWallet || "NOT PROVIDED"}</code>\n` +
        `TxID:\n<code>${txid}</code>\n` +
        `Date: ${date}`; //[cite: 2]
    }

    const approveLabel = isWithdraw ? "Approve Withdrawal" : isTopup ? "Credit Balance" : "Approve"; //[cite: 2]
    await tgSend(ADMIN_CHAT, msg, {
      reply_markup: {
        inline_keyboard: [[
          { text: approveLabel, callback_data: `approve_${txid}` }, //[cite: 2]
          { text: "Reject",    callback_data: `reject_${txid}`  } //[cite: 2]
        ]]
      }
    });

    res.json({ ok: true, success: true }); //[cite: 2]
  } catch (e) {
    console.error("Order error:", e.message); //[cite: 2]
    res.status(500).json({ ok: false, error: e.message }); //[cite: 2]
  }
});

// ═══ GET /api/status/:txid ═══
app.get("/api/status/:txid", async (req, res) => { //[cite: 2]
  try {
    const order = await Order.findOne({ txid: req.params.txid.trim() }, { status: 1, adminNote: 1, _id: 0 }); //[cite: 2]
    if (!order || order.status === "pending") return res.json({ status: "pending", adminNote: "" }); //[cite: 2]
    res.json({ status: order.status, adminNote: order.adminNote || "" }); //[cite: 2]
  } catch (e) { res.json({ status: "pending", adminNote: "" }); } //[cite: 2]
});

// ═══ NAYA ENDPOINT: App Load hotay hi User ID se pichla data nikalne ke liye ═══
app.get("/api/user/:userId", async (req, res) => {
  try {
    // Database mein se is user ka aakhri order nikalega (sab se naya wala)
    const latestOrder = await Order.findOne({ userId: req.params.userId }).sort({ createdAt: -1 });
    
    if (!latestOrder) {
      return res.json({ found: false });
    }
    
    // Agar order mil gaya toh saara zaroori data HTML ko bhej dega
    res.json({ 
      found: true, 
      plan: latestOrder.plan,
      fee: latestOrder.fee,
      amount: latestOrder.amount,
      status: latestOrder.status, 
      adminNote: latestOrder.adminNote || "",
      txid: latestOrder.txid
    });
  } catch (e) { 
      res.json({ found: false, error: e.message }); 
  }
});

// ═══ POST /api/balance (backward compat) ═══
app.post("/api/balance", async (req, res) => { //[cite: 2]
  const { userId, name, amount, network, txid, date } = req.body; //[cite: 2]
  if (!txid) return res.status(400).json({ ok: false, error: "Missing txid" }); //[cite: 2]
  await tgSend(ADMIN_CHAT, `BALANCE TOP-UP\nUser: ${name} | $${amount} ${network}\nTxID: <code>${txid}</code>`); //[cite: 2]
  res.json({ ok: true }); //[cite: 2]
});

app.get("/set-webhook", async (req, res) => { //[cite: 2]
  const { url } = req.query; //[cite: 2]
  if (!url) return res.send("Add ?url=https://your-app.up.railway.app/webhook"); //[cite: 2]
  try { const r = await axios.post(`${TG}/setWebhook`, { url }); res.send(`Webhook Set! ${JSON.stringify(r.data)}`); } //[cite: 2]
  catch (e) { res.send("Error: " + e.message); } //[cite: 2]
});

app.get("/", (req, res) => { //[cite: 2]
  const states = ["disconnected","connected","connecting","disconnecting"]; //[cite: 2]
  res.send(`German Flash Bot | DB: ${states[mongoose.connection.readyState]}`); //[cite: 2]
});

app.listen(PORT, "0.0.0.0", () => console.log(`Server on port ${PORT}`)); //[cite: 2]
