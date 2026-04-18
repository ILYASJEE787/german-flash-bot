// Server ke upar orders ka status yaad rakhne ke liye ek dabba (Memory)
let orderStatuses = {}; 

// ... baki code ...

// 1. Order receive karte waqt status 'pending' set karein
app.post("/order", async (req, res) => {
  const { plan, txid } = req.body;
  orderStatuses[txid] = "pending"; // Yaad rakho ke ye pending hai
  // ... (Telegram message bhejne wala purana code yahan rahega)
  res.json({ success: true });
});

// 2. Button click hone par status update karein
app.post("/webhook", async (req, res) => {
  const u = req.body;
  if (u.callback_query) {
    const data = u.callback_query.data;
    const txid = data.split("_")[1]; // approve_TXID se TXID nikalna

    if (data.startsWith("approve_")) {
      orderStatuses[txid] = "approved"; // Status badal kar approved kar diya
      await tgSend(u.callback_query.message.chat.id, "✅ Order Approved!");
    } else if (data.startsWith("reject_")) {
      orderStatuses[txid] = "rejected";
      await tgSend(u.callback_query.message.chat.id, "❌ Order Rejected!");
    }
  }
  res.sendStatus(200);
});

// 3. NAYA ROUTE: User ki app yahan se status check karegi
app.get("/status/:txid", (req, res) => {
  const txid = req.params.txid;
  const status = orderStatuses[txid] || "pending";
  res.json({ status: status });
});
