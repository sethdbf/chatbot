const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/7486139/2cjippz/";

app.post("/chat", async (req, res) => {
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "OpenAI-Beta": "assistants=v2"
  };

  try {
    // Step 1: Create a thread
    const threadRes = await axios.post(
      "https://api.openai.com/v1/threads",
      {},
      { headers }
    );
    const threadId = threadRes.data.id;

    // Step 2: Add message to thread
    await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        role: "user",
        content: req.body.message,
      },
      { headers }
    );

    // Step 3: Run the assistant
    const runRes = await axios.post(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      {
        assistant_id: "asst_6U1mFEqOgYL411Hh3FEOWO52",
      },
      { headers }
    );
    const runId = runRes.data.id;

    // Step 4: Poll for completion
    let status = "queued";
    while (status !== "completed") {
      const runStatus = await axios.get(
        `https://api.openai.com/v1/threads/${threadId}/runs/${runId}`,
        { headers }
      );
      status = runStatus.data.status;
      if (status === "failed") throw new Error("Run failed");
      if (status !== "completed") await new Promise((r) => setTimeout(r, 1000));
    }

    // Step 5: Retrieve messages
    const messagesRes = await axios.get(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      { headers }
    );
    const reply = messagesRes.data.data.find((m) => m.role === "assistant");
    const replyText = reply?.content[0]?.text?.value || "No reply found.";

    // Step 6: Use GPT to extract structured contact info
    const extractionPrompt = `Extract name, email, phone number, and company (if mentioned) from this message and return as JSON. Example: {\"name\":\"John Smith\",\"email\":\"john@example.com\",\"phone\":\"+15551234567\",\"company\":\"Acme Corp\"}

Message: ${req.body.message}`;

    const contactExtractionRes = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4-1106-preview",
        messages: [
          { role: "system", content: "You are a contact info extractor." },
          { role: "user", content: extractionPrompt }
        ]
      },
      { headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      }}
    );

    let contactJSON;
    try {
      contactJSON = JSON.parse(contactExtractionRes.data.choices[0].message.content);
    } catch {
      contactJSON = { name: null, email: null, phone: null, company: null };
    }

    if (contactJSON.name || contactJSON.email || contactJSON.phone || contactJSON.company) {
      const payload = {
        event: "contact_info_captured",
        timestamp: new Date().toISOString(),
        session_id: uuidv4(),
        user_message: req.body.message,
        assistant_reply: replyText,
        name_detected: contactJSON.name,
        email_detected: contactJSON.email,
        phone_detected: contactJSON.phone,
        company_detected: contactJSON.company
      };

      try {
        await axios.post(WEBHOOK_URL, payload);
        console.log("🔔 Webhook fired with:", payload);
      } catch (err) {
        console.error("Webhook failed:", err.message);
      }
    }

    // Step 7: Return response to frontend
    res.json({ reply: replyText });
  } catch (err) {
    console.error("Chatbot error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chatbot failed to respond." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Dunbridge chatbot running on port ${PORT}`);
});
