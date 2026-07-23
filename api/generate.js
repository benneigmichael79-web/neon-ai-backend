export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Missing required field: prompt" });

  try {
    const upstream = await fetch("https://chronos-creative-ai.lovable.app/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
    });
    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "");
      return res.status(502).json({ error: `Upstream error: ${upstream.status} ${t}` });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", fullText = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        rawEvent.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).forEach(dataStr => {
          if (dataStr === "[DONE]") return;
          try {
            const payload = JSON.parse(dataStr);
            const delta = payload?.choices?.[0]?.delta?.content;
            if (delta) fullText += delta;
          } catch {}
        });
      }
    }
    try { reader.cancel(); } catch {}

    if (!fullText) return res.status(502).json({ error: "Empty response from model" });
    return res.status(200).json({ text: fullText });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
    
