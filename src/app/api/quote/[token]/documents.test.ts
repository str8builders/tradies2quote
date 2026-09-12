import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ row: {} as Record<string, unknown> | null, error: null as unknown, download: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({ from: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mock.row, error: mock.error }) };
  return query;
} }) }));
vi.mock('@/lib/quote-storage', () => ({ downloadPdf: mock.download, downloadSignature: mock.download }));
import { GET as pdf } from './pdf/route';
import { GET as signature } from './signature/route';
const request = new NextRequest('https://tradies2quote.com/api/quote/audit/pdf');
const context = () => ({ params: Promise.resolve({ token: 'audit' }) });
beforeEach(() => {
  vi.clearAllMocks(); mock.error = null;
  mock.row = { id: 'audit-id', status: 'sent', pdf_path: 'private.pdf', signature_path: 'private.png',
    accepted_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', deleted_at: null };
  mock.download.mockResolvedValue(new Uint8Array([1, 2, 3]));
});
describe('Public document lifecycle boundaries', () => {
  it.each(['draft', 'declined', 'unknown'])('does not download a %s quote PDF', async status => {
    mock.row!.status = status;
    expect((await pdf(request, context())).status).toBe(404);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it.each(['sent', 'viewed', 'expired'])('denies an expired %s quote PDF', async status => {
    Object.assign(mock.row!, { status, expires_at: '2000-01-01T00:00:00Z' });
    expect((await pdf(request, context())).status).toBe(410);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it.each(['accepted', 'scheduled', 'in_progress', 'completed'])('keeps an agreed %s quote and signature available after the offer date', async status => {
    Object.assign(mock.row!, { status, expires_at: '2000-01-01T00:00:00Z' });
    expect((await pdf(request, context())).status).toBe(200);
    const response = await signature(request, context());
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each(['draft', 'sent', 'viewed', 'declined', 'expired'])('never serves a signature for a %s quote', async status => {
    mock.row!.status = status;
    expect((await signature(request, context())).status).toBe(404);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it.each(['deleted', 'missing', 'database-error'])('fails closed for %s documents', async reason => {
    if (reason === 'deleted') Object.assign(mock.row!, { status: 'accepted', deleted_at: '2026-01-02T00:00:00Z' });
    if (reason === 'missing') mock.row = null;
    if (reason === 'database-error') mock.error = { message: 'offline' };
    expect((await pdf(request, context())).status).toBe(404);
    expect((await signature(request, context())).status).toBe(404);
    expect(mock.download).not.toHaveBeenCalled();
  });
  it.each(['sent', 'viewed'])('serves the PDF for a current %s quote', async status => {
    mock.row!.status = status;
    expect((await pdf(request, context())).status).toBe(200);
  });
});
