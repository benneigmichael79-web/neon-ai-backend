export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests are allowed' });
  }

  const { prompt, image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ error: 'Missing "image" in request body (base64 data URL)' });
  }

  const textPrompt = (typeof prompt === 'string' && prompt.trim()) || 'Describe this image in detail.';

  const models = ['google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free'];

  try {
    let response, lastError;

    for (const model of models) {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://neon-ai-backend.vercel.app',
          'X-OpenRouter-Title': 'Neon Prompt Studio'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: textPrompt },
                { type: 'image_url', image_url: { url: image } }
              ]
            }
          ]
        })
      });

      if (response.ok) break;

      lastError = await response.text();
      if (response.status !== 429) {
        return res.status(response.status).json({ error: lastError });
      }
    }

    if (!response.ok) {
      return res.status(429).json({ error: lastError });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
