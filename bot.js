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

async function tgSend(chatId, text, extra = {}) {
  try { 
    await axios.post(`${TG}/sendMessage`, { 
      chat_id: chatId, 
      text: text, 
      parse_mode: "HTML",
      ...extra 
    }); 
  } catch (e) { console.error("Error:", e.message); }
}

// 1. Webhook for Button Clicks (Approve/Reject handle karne ke liye)
app.post("/webhook", async (req, res) => {
  const u = req.body;
  
  if (u.callback_query) {
    const data = u.callback_query.data; // e.g., "approve_12345"
    const chatId = u.callback_query.message.chat.id;
    const msgId = u.callback_query.message.message_id;

    if (data.startsWith("approve_")) {
      await tgSend(chatId, "✅ <b>Order Approved!</b> User ko notification chala gaya.");
    } else if (data.startsWith("reject_")) {
      await tgSend(chatId, "❌ <b>Order Rejected!</b>");
    }
  }

  if (u.message && u.message.text === "/start") {
    await tgSend(u.message.chat.id, "<b>Bot is Online! ✅</b>");
  }
  res.sendStatus(200);
});

// 2. Updated Order Route with Buttons
app.post("/order", async (req, res) => {
  const { name, plan, txid, amount, network } = req.body;
  
  const msg = `🔔 <b>NEW ORDER!</b>\n\n👤 User: ${name}\n📦 Plan: ${plan}\n💰 Amt: ${amount} ${network}\n🔗 TxID: <code>${txid}</code>`;
  
  // YAHAN BUTTONS ADD KIYE HAIN
  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Approve", callback_data: `approve_${txid}` },
      { text: "❌ Reject", callback_data: `reject_${txid}` }
    ]]
  };

  await tgSend(ADMIN_CHAT, msg, { reply_markup: keyboard });
  res.json({ success: true });
});

app.get("/set-webhook", async (req, res) => {
  const url = req.query.url;
  try { await axios.post(`${TG}/setWebhook`, { url }); res.send("Webhook Set! ✅"); }
  catch (e) { res.send("Error: " + e.message); }
});

app.listen(PORT, () => console.log("Server Running"));
