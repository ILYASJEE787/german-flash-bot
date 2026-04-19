const express = require("express");
const cors    = require("cors");
const axios   = require("axios");
const app     = express();
 
app.use(cors());
app.use(express.json());
 
const BOT_TOKEN  = "8790609389:AAH419MC4YuZpBLOeKYEVL6h9WxPshEkQRU";
const ADMIN_CHAT = "8495740508";
const PORT       = process.env.PORT || 3000;
const TG         = `https://api.telegram.org/bot${BOT_TOKEN}`;
 
// ═══════════════════════════════════════════════
// IN-MEMORY ORDER STORE
// Key = txid  |  Value = full order object
// ═══════════════════════════════════════════════
const orderStore = new Map();
 
async function tgSend(chatId, text, extra = {}) {
  try {
    await axios.post(`${TG}/sendMessage`, {
      chat_id: chatId, text, parse_mode: "HTML", ...extra
    });
  } catch (e) { console.error("TG Error:", e.message); }
}
 
// ─── WEBHOOK: Admin approve / reject buttons ───
app.post("/webhook", async (req, res) => {
  const u = req.body;
 
  if (u.callback_query) {
    const data   = u.callback_query.data;
    const chatId = u.callback_query.message.chat.id;
    const msgId  = u.callback_query.message.message_id;
 
    const sepIdx = data.indexOf("_");
    const action = data.substring(0, sepIdx);           // "approve" or "reject"
    const txid   = data.substring(sepIdx + 1);          // everything after first _
 
    const order = orderStore.get(txid);
    if (!order) {
      await tgSend(chatId, `⚠️ Order not found for TxID:\n<code>${txid}</code>\nServer restart hua hoga.`);
      return res.sendStatus(200);
    }
 
    if (action === "approve") {
      order.status    = "approved";
      order.adminNote = "Flash USDT delivery in progress.";
      orderStore.set(txid, order);
 
      await tgSend(chatId,
        `✅ <b>APPROVED!</b>\n\n` +
        `👤 ${order.name}\n📦 ${order.plan}\n` +
        `💳 Deliver to:\n<code>${order.userWallet}</code>`
      );
      // Remove buttons from original message
      try {
        await axios.post(`${TG}/editMessageReplyMarkup`, {
          chat_id: chatId, message_id: msgId,
          reply_markup: { inline_keyboard: [[{ text: "✅ APPROVED ✅", callback_data: "done" }]] }
        });
      } catch(e) {}
 
    } else if (action === "reject") {
      order.status    = "rejected";
      order.adminNote = "TxID could not be verified. Please contact support.";
      orderStore.set(txid, order);
 
      await tgSend(chatId,
        `❌ <b>REJECTED!</b>\n\n👤 ${order.name}\n📦 ${order.plan}`
      );
      try {
        await axios.post(`${TG}/editMessageReplyMarkup`, {
          chat_id: chatId, message_id: msgId,
          reply_markup: { inline_keyboard: [[{ text: "❌ REJECTED ❌", callback_data: "done" }]] }
        });
      } catch(e) {}
    }
  }
 
  if (u.message && u.message.text === "/start") {
    await tgSend(u.message.chat.id, "<b>German Flash Bot is Online ✅</b>");
  }
 
  res.sendStatus(200);
});
 
// ─── POST /order: New order from user ───
app.post("/order", async (req, res) => {
  const { userId, name, username, plan, fee, amount, userWallet, network, txid, date } = req.body;
 
  if (!txid || !plan) return res.status(400).json({ ok: false, error: "Missing txid or plan" });
 
  // Save to store
  orderStore.set(txid, {
    userId:     userId     || "unknown",
    name:       name       || "User",
    username:   username   || "",
    plan, fee, amount,
    userWallet: userWallet || "NOT PROVIDED",
    network,    txid,
    status:     "pending",
    adminNote:  "",
    date:       date || new Date().toLocaleDateString()
  });
 
  // Notify admin WITH userWallet
  const msg =
    `🔔 <b>NEW ORDER!</b>\n\n` +
    `👤 <b>User:</b> ${name} (@${username || "—"})\n` +
    `🆔 <b>ID:</b> <code>${userId}</code>\n` +
    `📦 <b>Plan:</b> ${plan}  |  💵 Fee: ${fee}\n` +
    `💰 <b>Receive:</b> ${amount}\n` +
    `🌐 <b>Network:</b> ${network}\n` +
    `💳 <b>User Wallet (deliver USDT here):</b>\n<code>${userWallet || "NOT PROVIDED"}</code>\n` +
    `🔗 <b>TxID:</b>\n<code>${txid}</code>\n` +
    `📅 <b>Date:</b> ${date}`;
 
  await tgSend(ADMIN_CHAT, msg, {
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Approve", callback_data: `approve_${txid}` },
        { text: "❌ Reject",  callback_data: `reject_${txid}`  }
      ]]
    }
  });
 
  res.json({ ok: true });
});
 
// ─── GET /status/:userId: Frontend polls this ───
app.get("/status/:userId", (req, res) => {
  const { userId } = req.params;
  const result = [];
  for (const order of orderStore.values()) {
    if (order.userId === userId) {
      result.push({
        txid:      order.txid,
        status:    order.status,
        adminNote: order.adminNote,
        plan:      order.plan
      });
    }
  }
  res.json(result);
});
 
// ─── POST /balance: Arbitrage top-up ───
app.post("/balance", async (req, res) => {
  const { userId, name, amount, network, txid, date } = req.body;
  if (!txid) return res.status(400).json({ ok: false, error: "Missing txid" });
 
  await tgSend(ADMIN_CHAT,
    `💰 <b>BALANCE TOP-UP</b>\n\n` +
    `👤 ${name} | ID: <code>${userId}</code>\n` +
    `💵 Amount: $${amount} ${network}\n` +
    `🔗 TxID: <code>${txid}</code>\n📅 ${date}`
  );
  res.json({ ok: true });
});
 
// ─── Webhook setup helper ───
app.get("/set-webhook", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.send("Add ?url=https://your-server.up.railway.app/webhook");
  try {
    const r = await axios.post(`${TG}/setWebhook`, { url });
    res.send(`✅ Webhook Set!<br>${JSON.stringify(r.data)}`);
  } catch (e) { res.send("Error: " + e.message); }
});
 
app.get("/", (req, res) =>
  res.send(`✅ German Flash Bot Server Running<br>Orders in memory: ${orderStore.size}`)
);
 
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
