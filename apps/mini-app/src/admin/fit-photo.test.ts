import { describe, expect, it } from 'vitest';
import { fitPhoto } from './fit-photo';

describe('photo fitting before upload', () => {
  it('hands the original file over when the browser cannot decode it', async () => {
    // jsdom has no createImageBitmap, standing in for an old browser: the upload must still go
    // through, because the server validates and downscales the photo as well.
    const file = new File(['not really an image'], 'phone.jpg', { type: 'image/jpeg' });
    await expect(fitPhoto(file)).resolves.toBe(file);
  });
});
