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

async function tgSend(chatId, text, extra={}) {
  try { await axios.post(`${TG}/sendMessage`, { chat_id:chatId, text, parse_mode:"HTML", ...extra }); }
  catch(e) { console.error("[TG Error]", e?.response?.data || e.message); }
}

// --- NEW: START COMMAND HANDLER ---
app.post("/webhook", async (req,res) => {
  const u = req.body;
  
  // Jab koi /start likhe
  if (u.message && u.message.text === "/start") {
    await tgSend(u.message.chat.id, "<b>Bot is running! ✅</b>\nWelcome to German Flash Bot App.");
  }

  // Button clicks handle karne ke liye
  if (u.callback_query) {
    const data = u.callback_query.data;
    const userId = u.callback_query.from.id;
    if (data.includes("_app_")) {
      await tgSend(userId, "✅ Your request has been approved!");
    }
  }
  res.sendStatus(200);
});

app.post("/order", async (req,res) => {
  const { userId, name, plan, txid, amount, network } = req.body;
  const msg = `🔔 <b>NEW ORDER</b>\n👤: ${name}\n📦: ${plan}\n💰: ${amount} ${network}\n🔗: ${txid}`;
  await tgSend(ADMIN_CHAT, msg);
  res.json({ success: true });
});

app.get("/set-webhook", async (req,res) => {
  const url = req.query.url;
  try { await axios.post(`${TG}/setWebhook`, { url }); res.send("Webhook Set! ✅"); }
  catch(e) { res.send("Error: "+e.message); }
});

app.listen(PORT, () => console.log("Server Live"));
