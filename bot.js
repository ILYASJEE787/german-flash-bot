const express = require("express");
const cors    = require("cors");
const axios   = require("axios");
const app     = express();

app.use(cors());
app.use(express.json());

// --- CONFIG ---
const BOT_TOKEN  = "8790609389:AAH419MC4YuZpBLOeKYEVL6h9WxPshEkQRU";
const ADMIN_CHAT = "8495740508";
const PORT       = process.env.PORT || 3000;
const TG         = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Memory mein status save karne ke liye
let orderStatuses = {};

async function tgSend(chatId, text, extra = {}) {
  try { 
    await axios.post(`${TG}/sendMessage`, { 
      chat_id: chatId, 
      text: text, 
      parse_mode: "HTML",
      ...extra 
    }); 
  } catch (e) { console.error("TG Error:", e.message); }
}

// 1. App se Order Receive karna
app.post("/order", async (req, res) => {
  try {
    const { name, plan, txid, amount, network } = req.body;
    
    // Status pending set karo
    orderStatuses[txid] = "pending";
    
    const msg = `🔔 <b>NEW ORDER!</b>\n\n👤 User: ${name}\n📦 Plan: ${plan}\n💰 Amt: ${amount} ${network}\n🔗 TxID: <code>${txid}</code>`;
    
    const keyboard = {
      inline_keyboard: [[
        { text: "✅ Approve", callback_data: `approve_${txid}` },
        { text: "❌ Reject", callback_data: `reject_${txid}` }
      ]]
    };

    await tgSend(ADMIN_CHAT, msg, { reply_markup: keyboard });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Telegram Webhook (Buttons handle karne ke liye)
app.post("/webhook", async (req, res) => {
  const u = req.body;
  
  if (u.callback_query) {
    const data = u.callback_query.data;
    const txid = data.split("_")[1];

    if (data.startsWith("approve_")) {
      orderStatuses[txid] = "approved";
      await tgSend(u.callback_query.message.chat.id, `✅ TxID: <code>${txid}</code> has been <b>Approved</b>!`);
    } else if (data.startsWith("reject_")) {
      orderStatuses[txid] = "rejected";
      await tgSend(u.callback_query.message.chat.id, `❌ TxID: <code>${txid}</code> has been <b>Rejected</b>!`);
    }
    return res.sendStatus(200);
  }

  if (u.message && u.message.text === "/start") {
    await tgSend(u.message.chat.id, "<b>Bot is Online! ✅</b>");
  }
  res.sendStatus(200);
});

// 3. Status Check Route (App yahan se poochegi)
app.get("/status/:txid", (req, res) => {
  const txid = req.params.txid;
  const currentStatus = orderStatuses[txid] || "pending";
  res.json({ status: currentStatus });
});

// Webhook Set karne ke liye
app.get("/set-webhook", async (req, res) => {
  const url = req.query.url;
  try { 
    await axios.post(`${TG}/setWebhook`, { url }); 
    res.send("Webhook Set! ✅"); 
  } catch (e) { res.send("Error: " + e.message); }
});

app.listen(PORT, () => console.log("Server is running on port", PORT));
