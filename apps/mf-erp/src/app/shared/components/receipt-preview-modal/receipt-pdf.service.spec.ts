import { ReceiptPdfService } from './receipt-pdf.service';

describe('signed receipt PDF', () => {
  it('opens a signed URL directly, even same origin, without credential fetch', async () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    const fetch = vi.spyOn(globalThis, 'fetch');
    const url = `${location.origin}/signed.pdf?signature=test`;
    await new ReceiptPdfService().download(url);
    expect(open).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer');
    expect(fetch).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('rejects a missing PDF without inventing a REST endpoint', async () => {
    const open = vi.spyOn(globalThis, 'open').mockReturnValue(null);
    await expect(new ReceiptPdfService().download(null)).rejects.toThrow('PDF pendiente o no disponible.');
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
