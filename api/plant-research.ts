import type { VercelRequest, VercelResponse } from '@vercel/node';
import { applyCors, handleCorsPreflight } from './_lib/cors.js';
import { requireAuth } from './_lib/auth.js';
import { applyRateLimit } from './_lib/rateLimit.js';

const RATE_LIMIT = {
  key: 'plant-research',
  maxRequests: 8,
  windowMs: 60 * 1000,
};

const MAX_PROMPT_CHARS = 240;

const parseBody = (req: VercelRequest): Record<string, unknown> => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body as Record<string, unknown>;
  return {};
};

const normalizeString = (value: unknown): string => String(value || '').trim();

const stripSimpleMarkdown = (text: string): string => {
  // Remove common Markdown emphasis/bullets so the UI doesn't show stray "*" characters.
  // Keep it intentionally conservative (we still want readable plain text).
  return (
    text
      // Bold/italic markers
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      // Inline code markers
      .replace(/`([^`]+)`/g, '$1')
      // Leading markdown bullets like "* item" or "- item"
      .replace(/^\s*[-*•]\s+/gm, '- ')
      .trim()
  );
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleCorsPreflight(req, res)) return;
  if (!applyCors(req, res)) return res.status(403).json({ error: 'Origin not allowed' });
  if (!applyRateLimit(req, res, RATE_LIMIT)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const body = parseBody(req);
  const prompt = normalizeString(body.prompt);
  const plantName = normalizeString(body.plant_name);
  const state = normalizeString(body.state);
  const owner = normalizeString(body.owner);
  const operator = normalizeString(body.operator);
  const websiteHint = normalizeString(body.website_hint);

  if (!prompt) return res.status(400).json({ error: 'prompt is required' });
  if (prompt.length > MAX_PROMPT_CHARS) {
    return res.status(400).json({ error: `prompt is too long (max ${MAX_PROMPT_CHARS} chars)` });
  }

  const apiKey = process.env.PERPLEXITY_API_KEY || '';
  if (!apiKey) return res.status(500).json({ error: 'PERPLEXITY_API_KEY is not configured' });

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.PERPLEXITY_MODEL || 'sonar-pro',
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are a careful research assistant. Answer briefly and accurately using public web sources. Prefer official owner/operator sources. Do not mention internal policy, filtering, or excluded sites in your answer. Return plain text only (no Markdown). If unsure, say so.',
          },
          {
            role: 'user',
            content: [
              'Context:',
              `Plant name: ${plantName || 'Unknown'}`,
              `State: ${state || 'Unknown'}`,
              `Owner: ${owner || 'Unknown'}`,
              `Operator: ${operator || 'Unknown'}`,
              `Website hint: ${websiteHint || 'Unknown'}`,
              '',
              'Question:',
              prompt,
              '',
              'Return a short answer (3-8 bullet points max). Plain text only.',
            ].join('\n'),
          },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return res.status(502).json({ error: `Perplexity request failed (${response.status})`, details: text });
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: unknown;
    };

    const answer = stripSimpleMarkdown(normalizeString(payload.choices?.[0]?.message?.content));
    const citations = Array.isArray(payload.citations)
      ? (payload.citations as unknown[]).map((c) => normalizeString(c)).filter(Boolean).slice(0, 10)
      : [];

    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.status(200).json({ answer, citations });
  } catch (error) {
    console.error('Plant research error:', error);
    return res.status(500).json({ error: 'Failed to run plant research' });
  }
}

