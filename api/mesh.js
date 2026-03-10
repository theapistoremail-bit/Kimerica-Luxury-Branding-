/**
 * POST /api/mesh
 * Genera assets 3D usando Meshy AI.
 * La MESHY_API_KEY vive solo en Vercel env vars.
 *
 * Body: { prompt: string, style?: 'realistic'|'cartoon'|'low-poly' }
 * Returns: { taskId, previewUrl, modelUrl, status }
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, style = 'realistic', taskId } = req.body;
  const key = process.env.MESHI;

  if (!key) {
    return res.status(500).json({ error: 'MESHY_API_KEY not configured' });
  }

  try {
    // ── POLL existing task ──────────────────────────────────────
    if (taskId) {
      const pollRes = await fetch(
        `https://api.meshy.ai/v2/text-to-3d/${taskId}`,
        { headers: { 'Authorization': `Bearer ${key}` } }
      );

      if (!pollRes.ok) {
        const err = await pollRes.json().catch(() => ({}));
        throw new Error(err.message || `Meshy poll ${pollRes.status}`);
      }

      const data = await pollRes.json();
      return res.status(200).json({
        taskId: data.id,
        status: data.status,           // PENDING | IN_PROGRESS | SUCCEEDED | FAILED
        progress: data.progress || 0,
        previewUrl: data.thumbnail_url || null,
        modelUrl: data.model_urls?.glb || null,
        videoUrl: data.video_url || null,
      });
    }

    // ── CREATE new task ─────────────────────────────────────────
    if (!prompt?.trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const createRes = await fetch('https://api.meshy.ai/v2/text-to-3d', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        mode: 'preview',
        prompt,
        art_style: style,
        negative_prompt: 'low quality, noisy, low poly (if realistic), ugly',
        ai_model: 'meshy-4',
        topology: 'quad',
        target_polycount: 30000,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.message || `Meshy create ${createRes.status}`);
    }

    const { result } = await createRes.json();
    return res.status(200).json({ taskId: result, status: 'PENDING', progress: 0 });

  } catch (err) {
    console.error('[/api/mesh]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
