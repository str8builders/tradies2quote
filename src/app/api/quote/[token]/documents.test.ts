import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mock = vi.hoisted(() => ({ row: {} as Record<string, unknown> | null, error: null as unknown, download: vi.fn(),
  profile: { business_name: 'Audit Business' } as Record<string, unknown> | null, render: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ adminClient: () => ({ from: (table: string) => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => table === 'profiles'
    ? { data: mock.profile, error: null } : { data: mock.row, error: mock.error } };
  return query;
} }) }));
vi.mock('@/lib/quote-storage', () => ({ downloadPdf: mock.download, downloadSignature: mock.download }));
vi.mock('@/lib/pdf-generator', () => ({ generateQuotePdf: mock.render }));
vi.mock('@/lib/pdf-logo', () => ({ loadLogoForPdf: async () => null }));
vi.mock('@/lib/observability', () => ({ captureError: vi.fn() }));
import { GET as pdf } from './pdf/route';
import { GET as signature } from './signature/route';
const request = new NextRequest('https://tradies2quote.com/api/quote/audit/pdf');
const context = () => ({ params: Promise.resolve({ token: 'audit' }) });
beforeEach(() => {
  vi.clearAllMocks(); mock.error = null;
  mock.row = { id: 'audit-id', user_id: 'owner-id', status: 'sent', pdf_path: 'private.pdf', signature_path: 'private.png',
    accepted_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z', expires_at: '2099-01-01T00:00:00Z', deleted_at: null,
    version: 1, pdf_version: 1, quote_data: { line_items: [], total: 0 } };
  mock.profile = { business_name: 'Audit Business' };
  mock.download.mockResolvedValue(new Uint8Array([1, 2, 3]));
  mock.render.mockResolvedValue(new Uint8Array([4, 5, 6]));
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
describe('Public PDF matches the current revision of the quote', () => {
  it('serves the stored send-time PDF while it shows the current revision', async () => {
    const response = await pdf(request, context());
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(mock.render).not.toHaveBeenCalled();
  });
  it.each([['edited after sending', 1], ['stored before revisions were tracked', null]])('re-renders a stored PDF %s', async (_label, pdfVersion) => {
    Object.assign(mock.row!, { version: 2, pdf_version: pdfVersion });
    const response = await pdf(request, context());
    expect(response.status).toBe(200);
    expect(mock.download).not.toHaveBeenCalled();
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5, 6]));
    expect(mock.render).toHaveBeenCalledWith(expect.objectContaining({
      quoteId: 'audit-id', quote: mock.row!.quote_data, acceptUrl: expect.stringMatching(/\/quote\/audit$/),
    }));
  });
  it('serves the stored file again once a re-send stamps the current revision', async () => {
    Object.assign(mock.row!, { version: 3, pdf_version: 3 });
    expect((await pdf(request, context())).status).toBe(200);
    expect(mock.download).toHaveBeenCalledTimes(1);
    expect(mock.render).not.toHaveBeenCalled();
  });
  it('never falls back to the stale file when the current revision cannot be rendered', async () => {
    Object.assign(mock.row!, { version: 3, pdf_version: 2 });
    mock.profile = { business_name: '  ' };
    expect((await pdf(request, context())).status).toBe(503);
    expect(mock.download).not.toHaveBeenCalled();
  });
});
