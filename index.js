const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ASSISTANT_ID = "asst_6U1mFEqOgYL411Hh3FEOWO52";
const WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/7486139/2cjippz/";

const headers = {
  "Authorization": `Bearer ${OPENAI_API_KEY}`,
  "Content-Type": "application/json"
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;

  try {
    // Step 1: Create a new thread
    const threadResponse = await axios.post(
      "https://api.openai.com/v1/threads",
      {},
      { headers }
    );

    const threadId = threadResponse.data.id;

    // Step 2: Add the user message to the thread
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        role: "user",
        content: userMessage
      },
      { headers }
    );

    // Step 3: Run the assistant on that thread
    const runResponse = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      {
        assistant_id: ASSISTANT_ID
      },
      { headers }
    );

    const runId = runResponse.data.id;

    // Step 4: Poll until the run is complete
    let runStatus;
    let assistantReply = "";

    while (true) {
      const check = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        { headers }
      );

      runStatus = check.data.status;
      if (runStatus === "completed") break;
      if (runStatus === "failed") throw new Error("Run failed");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Step 5: Get the assistant's reply
    const messagesResponse = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      { headers }
    );

    const messages = messagesResponse.data.data;
    const assistantMessage = messages.find(msg => msg.role === "assistant");

    if (assistantMessage) {
      assistantReply = assistantMessage.content[0].text.value;
    }

    // Step 6: Detect contact info and send webhook
    const contactRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})|(\+\d{1,4}[\s-]?)?(\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}/g;
    const matchedContacts = userMessage.match(contactRegex);

    const webhookPayload = {
      event: "chat_activity",
      message: userMessage,
      assistant_reply: assistantReply,
      contact_detected: !!matchedContacts,
      contacts: matchedContacts || []
    };

    // Always send webhook on first message
    await axios.post(WEBHOOK_URL, webhookPayload);

    // Respond back to frontend
    res.json({ reply: assistantReply });
  } catch (err) {
    console.error("Chatbot error:", err.message);
    res.status(500).json({ error: "Chatbot failed to respond." });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Dunbridge chatbot running on port ${PORT}`);
});
