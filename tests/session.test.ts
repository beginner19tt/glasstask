import { describe, expect, it } from 'vitest';
import { createSessionToken, readSessionToken, sign, verify } from '../worker/session';

const SECRET = 'test-secret-value';

describe('signed tokens', () => {
  it('round-trips a payload', async () => {
    const token = await sign({ a: 1, b: 'two' }, SECRET);
    expect(await verify<{ a: number; b: string }>(token, SECRET)).toEqual({ a: 1, b: 'two' });
  });

  it('rejects a token signed with another secret', async () => {
    const token = await sign({ a: 1 }, SECRET);
    expect(await verify(token, 'other-secret')).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await sign({ sub: 'user-a' }, SECRET);
    const forged = (await sign({ sub: 'user-b' }, 'attacker')).split('.')[0] + '.' + token.split('.')[1];
    expect(await verify(forged, SECRET)).toBeNull();
  });

  it('rejects malformed input', async () => {
    expect(await verify('', SECRET)).toBeNull();
    expect(await verify('nodot', SECRET)).toBeNull();
    expect(await verify('.sig', SECRET)).toBeNull();
    expect(await verify('body.!!!not-base64!!!', SECRET)).toBeNull();
  });

  it('survives a unicode payload', async () => {
    const token = await sign({ name: '徳都 真也', emoji: '✦' }, SECRET);
    expect(await verify<{ name: string }>(token, SECRET)).toEqual({
      name: '徳都 真也',
      emoji: '✦',
    });
  });
});

describe('session tokens', () => {
  it('accepts a freshly minted session', async () => {
    const token = await createSessionToken(
      { sub: 'google:1', email: 'a@example.com', name: 'A', picture: '' },
      SECRET,
    );
    const session = await readSessionToken(token, SECRET);
    expect(session?.sub).toBe('google:1');
    expect(session?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('rejects an expired session', async () => {
    const token = await sign({ sub: 'google:1', exp: Math.floor(Date.now() / 1000) - 10 }, SECRET);
    expect(await readSessionToken(token, SECRET)).toBeNull();
  });

  it('rejects a session with no subject or no expiry', async () => {
    expect(await readSessionToken(await sign({ exp: 2 ** 40 }, SECRET), SECRET)).toBeNull();
    expect(await readSessionToken(await sign({ sub: 'x' }, SECRET), SECRET)).toBeNull();
    expect(await readSessionToken(await sign({ sub: '', exp: 2 ** 40 }, SECRET), SECRET)).toBeNull();
  });

  it('rejects a missing cookie', async () => {
    expect(await readSessionToken(undefined, SECRET)).toBeNull();
  });
});
