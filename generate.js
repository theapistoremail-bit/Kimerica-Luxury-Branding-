/**
 * POST /api/generate
 * Genera el AI creative proposal usando Claude con streaming SSE.
 * Las API keys NUNCA llegan al cliente — solo viven en Vercel env vars.
 */

export const config = {
  runtime: 'edge', // Edge runtime para streaming real
};

const MODEL_MAP = {
  'claude-opus-4-6':          'claude-opus-4-6',
  'claude-sonnet-4-6':        'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001':'claude-haiku-4-5-20251001',
  'gpt-4o':                   'gpt-4o',
  'gpt-4o-mini':              'gpt-4o-mini',
  'deepseek-chat':            'deepseek-chat',
};

const PROVIDER = (model) => {
  if (model.startsWith('claude'))    return 'anthropic';
  if (model.startsWith('gpt'))       return 'openai';
  if (model.startsWith('deepseek'))  return 'deepseek';
  return 'anthropic';
};

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const { vision, selections = {}, model = 'claude-sonnet-4-6' } = await req.json();

  if (!vision?.trim()) {
    return new Response(JSON.stringify({ error: 'Vision is required' }), { status: 400 });
  }

  const provider = PROVIDER(model);

  const systemPrompt = `You are KIMERICA's lead creative director — a world-class luxury branding strategist with 20 years shaping the visual identity of iconic global brands. Write a complete AI creative proposal. Be poetic, authoritative, and precise. Use high-concept language appropriate for luxury branding.

Structure your response EXACTLY like this:

[CREATIVE DIRECTION]
Write 3 powerful paragraphs of creative direction. Each paragraph should be distinct and commanding.

[SCOPE]
Creative Direction & Strategy: $X,XXX
Visual Identity System: $X,XXX
Digital Experience Design: $X,XXX
3D / AI-Driven Elements: $X,XXX
Timeline: X–X weeks
Total: $XX,XXX`;

  const objMap = {
    authority: 'Brand Authority System',
    identity:  'Visual Identity System',
    immersive: 'Immersive 3D Experience',
    product:   'Product Launch System',
  };
  const visMap = {
    minimal:    'Minimal & Refined',
    bold:       'Bold & High Contrast',
    editorial:  'Editorial & Elegant',
    futuristic: 'Futuristic',
    abstract:   'Conceptual / Abstract',
    luxury:     'Luxury Black',
  };

  const userMsg = `Project vision: ${vision}
Objective: ${objMap[selections.obj] || 'Brand Authority'}
Visual direction: ${visMap[selections.vis] || 'Luxury Black'}
Budget range: ${selections.bud || 'Open'}

Generate a powerful creative direction proposal and realistic project scope.`;

  try {
    // ─── ANTHROPIC (Claude) ─────────────────────────────────────
    if (provider === 'anthropic') {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('ANTHROPIC_API_KEY not configured');

      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL_MAP[model] || 'claude-sonnet-4-6',
          max_tokens: 1400,
          stream: true,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMsg }],
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic ${upstream.status}`);
      }

      // Proxy the SSE stream directly to the client
      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Provider': 'anthropic',
        },
      });
    }

    // ─── OPENAI (GPT-4o) ─────────────────────────────────────────
    if (provider === 'openai') {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY not configured');

      const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL_MAP[model] || 'gpt-4o',
          max_tokens: 1400,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMsg },
          ],
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}));
        throw new Error(err.error?.message || `OpenAI ${upstream.status}`);
      }

      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Provider': 'openai',
        },
      });
    }

    // ─── DEEPSEEK ─────────────────────────────────────────────────
    if (provider === 'deepseek') {
      const key = process.env.DEEPSEEK_API_KEY;
      if (!key) throw new Error('DEEPSEEK_API_KEY not configured');

      const upstream = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          max_tokens: 1400,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user',   content: userMsg },
          ],
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}));
        throw new Error(err.error?.message || `DeepSeek ${upstream.status}`);
      }

      return new Response(upstream.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'X-Provider': 'deepseek',
        },
      });
    }

    throw new Error('Unknown provider');

  } catch (err) {
    console.error('[/api/generate]', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
