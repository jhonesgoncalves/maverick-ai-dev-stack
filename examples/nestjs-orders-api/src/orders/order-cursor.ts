import { createHmac, timingSafeEqual } from 'node:crypto';
import { OrderStatus } from './order.entity';

export interface CursorPayload {
  createdAt: string;
  customerId: string | null;
  status: OrderStatus | null;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function encodeCursor(payload: CursorPayload, secret: string): string {
  const json = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = sign(json, secret);
  return `${json}.${signature}`;
}

export function decodeCursor(cursor: string, secret: string): CursorPayload | null {
  if (!cursor) return null;

  const parts = cursor.split('.');
  if (parts.length !== 2) return null;
  const [json, signature] = parts;
  if (!json || !signature) return null;

  const expectedSignature = sign(json, secret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(json, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  if (!isCursorPayload(parsed)) return null;
  return parsed;
}

function isCursorPayload(value: unknown): value is CursorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (typeof candidate.createdAt !== 'string') return false;
  if (candidate.customerId !== null && typeof candidate.customerId !== 'string') return false;
  if (
    candidate.status !== null &&
    candidate.status !== 'pending' &&
    candidate.status !== 'paid' &&
    candidate.status !== 'cancelled'
  ) {
    return false;
  }

  return true;
}
