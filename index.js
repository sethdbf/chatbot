const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post("/chat", async (req, res) => {
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    "Content-Type": "application/json",
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

    res.json({ reply: reply?.content[0]?.text?.value || "No reply found." });
  } catch (err) {
    console.error("OpenAI Assistants error:", err.response?.data || err.message);
    res.status(500).json({ error: "Chatbot failed to respond." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Dunbridge chatbot running on port ${PORT}`);
});
