// ════════════════════════════════════════════════════════════
//  GERMAN FLASH BOT — Updated Backend
// ════════════════════════════════════════════════════════════
const express = require("express");
const cors    = require("cors");
const axios   = require("axios");
const app     = express();
app.use(cors());
app.use(express.json());

// --- AAPKI DETAILS YAHAN SET HAIN ---
const BOT_TOKEN  = "8790609389:AAH419MC4YuZpBLOeKYEVL6h9WxPshEkQRU";
const ADMIN_CHAT = "8495740508";
const PORT       = process.env.PORT || 3000;
const TG         = `https://api.telegram.org/bot${BOT_TOKEN}`;

const orders  = new Map(); 
const balReqs = new Map(); 

async function tgSend(chatId, text, extra={}) {
  try { const r = await axios.post(`${TG}/sendMessage`, { chat_id:chatId, text, parse_mode:"HTML", ...extra }); return r.data; }
  catch(e) { console.error("[TG]", e?.response?.data || e.message); return null; }
}

app.post("/order", async (req,res) => {
  const { userId, name, plan, txid, amount, network } = req.body;
  const msg = `🔔 <b>NEW ORDER</b>\n\n👤 User: ${name}\n📦 Plan: ${plan}\n💰 Amount: ${amount} ${network}\n🔗 TxID: <code>${txid}</code>`;
  const kbd = { inline_keyboard: [[
    { text: "✅ Approve", callback_data: `ord_app_${txid}` },
    { text: "❌ Reject", callback_data: `ord_rej_${txid}` }
  ]]};
  const sent = await tgSend(ADMIN_CHAT, msg, { reply_markup: kbd });
  if(sent) orders.set(txid, { userId, name, plan, messageId: sent.message_id, status:"pending" });
  res.json({ success: !!sent });
});

app.post("/deposit", async (req,res) => {
  const { userId, name, amount, txid, network } = req.body;
  const msg = `💰 <b>BALANCE TOP-UP</b>\n\n👤 User: ${name}\n💵 Amount: ${amount} ${network}\n🔗 TxID: <code>${txid}</code>`;
  const kbd = { inline_keyboard: [[
    { text: "✅ Confirm", callback_data: `bal_app_${txid}` },
    { text: "❌ Reject", callback_data: `bal_rej_${txid}` }
  ]]};
  const sent = await tgSend(ADMIN_CHAT, msg, { reply_markup: kbd });
  if(sent) balReqs.set(txid, { userId, name, amount, messageId: sent.message_id, status:"pending" });
  res.json({ success: !!sent });
});

app.post("/webhook", async (req,res) => {
  const u = req.body;
  if (u.callback_query) {
    const cb = u.callback_query;
    const data = cb.data;
    if (data.startsWith("ord_")) {
      const [,,txid] = data.split("_");
      const ord = orders.get(txid);
      if(!ord) return res.sendStatus(200);
      if (data.includes("_app_")) {
        await tgSend(ord.userId, `✅ <b>Order Approved!</b>\nYour flash node for ${ord.plan} is active.`);
      }
    }
    // ... baki logic same rahega
  }
  res.sendStatus(200);
});

app.get("/set-webhook", async (req,res) => {
  const url = req.query.url;
  try { await axios.post(`${TG}/setWebhook`, { url }); res.send("Webhook Set! ✅"); }
  catch(e) { res.send("Error: "+e.message); }
});

app.listen(PORT, () => console.log("Server running..."));
