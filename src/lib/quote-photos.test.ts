import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { normaliseQuotePhoto, MAX_PHOTO_BYTES } from './quote-photos';
describe('quote photo decoding',()=>{
 it('rejects empty, oversized and disguised files',async()=>{await expect(normaliseQuotePhoto(new Uint8Array())).rejects.toThrow();await expect(normaliseQuotePhoto(new Uint8Array(MAX_PHOTO_BYTES+1))).rejects.toThrow();await expect(normaliseQuotePhoto(Buffer.from('<svg><script>alert(1)</script></svg>'))).rejects.toThrow();});
 it('normalises a real image and strips metadata',async()=>{const input=await sharp({create:{width:2400,height:1200,channels:3,background:'#ff5f15'}}).withMetadata().png().toBuffer();const output=await normaliseQuotePhoto(input);const meta=await sharp(output).metadata();expect(meta.format).toBe('jpeg');expect(meta.width).toBe(2000);expect(meta.height).toBe(1000);expect(meta.exif).toBeUndefined();});
});
