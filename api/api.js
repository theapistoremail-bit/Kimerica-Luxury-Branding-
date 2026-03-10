/**
 * lib/api.js
 * Cliente para las API Routes de KIMERICA.
 * NUNCA maneja keys — eso es responsabilidad del servidor.
 */

// ── Streaming proposal ───────────────────────────────────────────

/**
 * Llama a /api/generate con streaming SSE.
 * @param {Object} opts
 * @param {string} opts.vision      - Texto del usuario
 * @param {Object} opts.selections  - { obj, vis, bud }
 * @param {string} opts.model       - Modelo elegido
 * @param {string} opts.provider    - 'anthropic' | 'openai' | 'deepseek'
 * @param {(chunk: string) => void} opts.onChunk  - Callback por cada delta
 * @param {() => void}              opts.onDone   - Callback al terminar
 * @returns {Promise<string>}       - Texto completo
 */
export async function streamProposal({ vision, selections, model, provider, onChunk, onDone }) {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vision, selections, model, provider }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }

  const detectedProvider = res.headers.get('X-Provider') || provider;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const json = JSON.parse(data);
        let delta = '';

        // CLAUDE format
        if (json.type === 'content_block_delta') {
          delta = json.delta?.text || '';
        }
        // OpenAI / DeepSeek format
        else if (json.choices?.[0]?.delta?.content) {
          delta = json.choices[0].delta.content;
        }
// LEONARDO / DeepSeek format
        else if (json.choices?.[0]?.delta?.content) {
          delta = json.choices[0].delta.content;
        }
// DeepSeek format
        else if (json.choices?.[0]?.delta?.content) {
          delta = json.choices[0].delta.content;
        }
//  MESHI format
        else if (json.choices?.[0]?.delta?.content) {
          delta = json.choices[0].delta.content;
        }

        if (delta) {
          fullText += delta;
          onChunk?.(delta, fullText);
        }
      } catch (e) {
        // Skip non-JSON lines (comments, keep-alives)
      }
    }
  }

  onDone?.(fullText);
  return fullText;
}

// ── Parse scope from AI output ───────────────────────────────────

export function parseScope(text) {
  const sc = {};
  const patterns = [
    [/creative direction[^:]*:\s*(\$[\d,]+)/i,   'sc1'],
    [/visual identity[^:]*:\s*(\$[\d,]+)/i,       'sc2'],
    [/digital experience[^:]*:\s*(\$[\d,]+)/i,    'sc3'],
    [/3d[^:]*:\s*(\$[\d,]+)/i,                    'sc4'],
    [/timeline[^:]*:\s*([\d–\-]+ weeks)/i,        'time'],
    [/total[^:]*:\s*(\$[\d,]+)/i,                 'total'],
  ];
  for (const [rx, key] of patterns) {
    const m = text.match(rx);
    if (m) sc[key] = m[1];
  }
  return sc;
}

// ── Extract creative direction text ─────────────────────────────

export function extractCreativeDirection(text) {
  const match = text.match(/\[CREATIVE DIRECTION\]([\s\S]*?)(?:\[SCOPE\]|$)/i);
  return match ? match[1].trim() : text;
}

// ── Generate images via Leonardo AI ─────────────────────────────

export async function generateImages({ prompt, count = 4 }) {
  const res = await fetch('/api/images', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, count }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Image generation failed ${res.status}`);
  }
  const { images } = await res.json();
  return images; // string[]
}

// ── Generate 3D mesh via Meshy AI ────────────────────────────────

/**
 * Inicia generación 3D y hace polling hasta completar.
 * @param {string} prompt
 * @param {(progress: number, status: string) => void} onProgress
 * @returns {Promise<{ previewUrl, modelUrl, videoUrl }>}
 */
export async function generateMesh(prompt, onProgress) {
  // 1. Create task
  const createRes = await fetch('/api/mesh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!createRes.ok) throw new Error('Failed to start 3D generation');
  const { taskId } = await createRes.json();

  // 2. Poll until done
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));

    const pollRes = await fetch('/api/mesh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
    if (!pollRes.ok) continue;

    const data = await pollRes.json();
    onProgress?.(data.progress || 0, data.status);

    if (data.status === 'SUCCEEDED') {
      return {
        previewUrl: data.previewUrl,
        modelUrl:   data.modelUrl,
        videoUrl:   data.videoUrl,
      };
    }
    if (data.status === 'FAILED') {
      throw new Error('3D generation failed');
    }
  }
  throw new Error('3D generation timed out');
}

// ── Check which providers are active ────────────────────────────

export async function checkStatus() {
  const res = await fetch('/api/status');
  if (!res.ok) throw new Error('Status check failed');
  return res.json();
}

// ── Download package ────────────────────────────────────────────

export async function downloadPackage({ proposal, selections, model }) {
  const res = await fetch('/api/download-package', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposal, selections, model }),
  });
  if (!res.ok) throw new Error('Package generation failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'KIMERICA_Project_Package.zip';
  a.click();
  URL.revokeObjectURL(url);
}
