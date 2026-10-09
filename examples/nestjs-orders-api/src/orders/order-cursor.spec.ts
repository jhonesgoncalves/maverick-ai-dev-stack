import { CursorPayload, decodeCursor, encodeCursor } from './order-cursor';

describe('order-cursor', () => {
  const secret = 'test-secret';

  it('round-trips a payload with filters', () => {
    const payload: CursorPayload = {
      createdAt: '2026-09-27T12:00:00.000Z',
      customerId: 'c-1',
      status: 'paid',
    };

    const cursor = encodeCursor(payload, secret);

    expect(decodeCursor(cursor, secret)).toEqual(payload);
  });

  it('round-trips a payload without filters', () => {
    const payload: CursorPayload = {
      createdAt: '2026-09-27T12:00:00.000Z',
      customerId: null,
      status: null,
    };

    const cursor = encodeCursor(payload, secret);

    expect(decodeCursor(cursor, secret)).toEqual(payload);
  });

  it('rejects an empty cursor', () => {
    expect(decodeCursor('', secret)).toBeNull();
  });

  it('rejects a malformed cursor', () => {
    expect(decodeCursor('garbage', secret)).toBeNull();
  });

  it('rejects a tampered cursor', () => {
    const payload: CursorPayload = {
      createdAt: '2026-09-27T12:00:00.000Z',
      customerId: 'c-1',
      status: null,
    };
    const cursor = encodeCursor(payload, secret);
    const [, signature] = cursor.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...payload, customerId: 'c-2' }),
      'utf8',
    ).toString('base64url');

    expect(decodeCursor(`${tamperedPayload}.${signature}`, secret)).toBeNull();
  });

  it('rejects a cursor signed with a different secret', () => {
    const payload: CursorPayload = {
      createdAt: '2026-09-27T12:00:00.000Z',
      customerId: null,
      status: 'pending',
    };
    const cursor = encodeCursor(payload, secret);

    expect(decodeCursor(cursor, 'other-secret')).toBeNull();
  });
});
