import { afterEach, describe, expect, it } from 'vitest';
import { applyCors } from './cors.js';

type MockReq = {
  headers: Record<string, string | undefined>;
  method?: string;
};

type MockRes = {
  headers: Record<string, string>;
  setHeader: (key: string, value: string) => void;
};

const createRes = (): MockRes => ({
  headers: {},
  setHeader(key, value) {
    this.headers[key] = value;
  },
});

describe('cors helpers', () => {
  afterEach(() => {
    delete process.env.ALLOWED_ORIGINS;
  });

  it('allows same-origin requests without ALLOWED_ORIGINS configured', () => {
    const req: MockReq = {
      headers: {
        origin: 'https://app.example.com',
        host: 'app.example.com',
        'x-forwarded-proto': 'https',
      },
    };
    const res = createRes();

    const allowed = applyCors(req as never, res as never);

    expect(allowed).toBe(true);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://app.example.com');
  });

  it('blocks cross-origin requests when ALLOWED_ORIGINS is not configured', () => {
    const req: MockReq = {
      headers: {
        origin: 'https://evil.example.com',
        host: 'app.example.com',
        'x-forwarded-proto': 'https',
      },
    };
    const res = createRes();

    const allowed = applyCors(req as never, res as never);

    expect(allowed).toBe(false);
  });
});
