/**
 * POST /api/images
 * Genera imágenes de moodboard usando Leonardo AI.
 * La LEONARDO_API_KEY vive solo en Vercel env vars.
 */

// Prompt builder + generation params per section of the branding presentation.
const CATEGORY_PRESETS = {
  moodboard: {
    build: (p) => `Luxury brand moodboard: ${p}. Dark editorial aesthetic, high contrast, minimal, premium, accent on black background`,
    photoReal: false,
    negative: 'low quality, blurry, amateur, watermark, text',
  },
  logo: {
    build: (p) => `Minimalist luxury logo mark concept for a brand described as: ${p}. Vector-style emblem or monogram, centered composition, plain neutral background, elegant negative space, professional brand identity design sheet`,
    photoReal: false,
    negative: 'low quality, blurry, amateur, watermark, photo, realistic photograph, clutter',
  },
  packaging: {
    build: (p) => `Premium product packaging mockup for a luxury brand described as: ${p}. Elegant box, bottle or bag design, studio lighting, minimalist backdrop, high-end commercial product photography`,
    photoReal: true,
    negative: 'low quality, blurry, amateur, watermark, text errors, distorted shape',
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, count = 4, width = 512, height = 512, category = 'moodboard' } = req.body;

  const key = process.env.LEONARDO;
  if (!key) {
    return res.status(500).json({ error: 'LEONARDO_API_KEY not configured' });
  }

  if (!prompt?.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const preset = CATEGORY_PRESETS[category] || CATEGORY_PRESETS.moodboard;
  const finalPrompt = preset.build(prompt);

  try {
    // 1. Create generation
    const genRes = await fetch('https://cloud.leonardo.ai/api/rest/v1/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        modelId: 'b24e16ff-06e3-43eb-8d33-4416c2d75876', // Leonardo Phoenix
        width,
        height,
        num_images: Math.min(count, 4),
        guidance_scale: 7,
        negative_prompt: preset.negative,
        photoReal: preset.photoReal,
        alchemy: true,
      }),
    });

    if (!genRes.ok) {
      const err = await genRes.json().catch(() => ({}));
      throw new Error(err.error || `Leonardo ${genRes.status}`);
    }

    const { sdGenerationJob } = await genRes.json();
    const generationId = sdGenerationJob?.generationId;
    if (!generationId) throw new Error('No generation ID returned');

    // 2. Poll for results (max 30s)
    let images = [];
    for (let attempt = 0; attempt < 15; attempt++) {
      await new Promise(r => setTimeout(r, 2000));

      const pollRes = await fetch(
        `https://cloud.leonardo.ai/api/rest/v1/generations/${generationId}`,
        { headers: { 'Authorization': `Bearer ${key}` } }
      );

      if (!pollRes.ok) continue;

      const data = await pollRes.json();
      const gen = data.generations_by_pk;

      if (gen?.status === 'COMPLETE') {
        images = (gen.generated_images || []).map(img => img.url);
        break;
      }
      if (gen?.status === 'FAILED') {
        throw new Error('Leonardo generation failed');
      }
    }

    return res.status(200).json({ images });

  } catch (err) {
    console.error('[/api/images]', err.message);
    return res.status(500).json({ error: err.message, images: [] });
  }
}
