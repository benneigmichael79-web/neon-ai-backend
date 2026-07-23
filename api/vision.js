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
    const upstream = await fetch("https://chronos-creative-ai.lovable.app/api/generate-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!upstream.ok || !upstream.body) {
      const t = await upstream.text().catch(() => "");
      return res.status(502).json({ error: `Upstream error: ${upstream.status} ${t}` });
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "", finalB64 = null, streamError = null;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let eventType = "message", dataLines = [];
        rawEvent.split("\n").forEach(line => {
          if (line.startsWith("event:")) eventType = line.slice(6).trim();
          else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        });
        const dataStr = dataLines.join("\n");
        if (!dataStr) continue;
        let payload;
        try { payload = JSON.parse(dataStr); } catch { continue; }
        if (eventType === "error" || payload?.type === "error") { streamError = payload?.error?.message || "Image generation failed"; continue; }
        if (payload?.type === "image_generation.completed" && payload.b64_json) finalB64 = payload.b64_json;
      }
      if (finalB64) break;
    }
    try { reader.cancel(); } catch {}

    if (!finalB64) return res.status(502).json({ error: streamError || "Image stream ended without a completed image" });
    const dataUri = `data:image/png;base64,${finalB64}`;
    return res.status(200).json({ image: dataUri, url: dataUri, imageUrl: dataUri, success: true });
  } catch (err) {
    return res.status(500).json({ error: "Image generation failed: " + (err?.message || "unknown error") });
  }
}
  
