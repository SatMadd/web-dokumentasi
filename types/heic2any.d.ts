/**
 * Ambient type declarations for heic2any v0.0.4.
 * No official @types/heic2any package exists, so we declare the module manually.
 * https://github.com/alexcorvi/heic2any
 */
declare module "heic2any" {
  interface Heic2AnyOptions {
    /** The HEIC/HEIF Blob to convert. */
    blob: Blob;
    /** Target MIME type. Typically "image/jpeg" or "image/png". */
    toType?: string;
    /** Quality for lossy formats (0–1). Default 0.92 for JPEG. */
    quality?: number;
    /** How many frames to extract from animated HEICs. Default 1. */
    multiple?: boolean;
  }

  /**
   * Convert a HEIC/HEIF Blob to a browser-renderable image Blob.
   * Returns a single Blob (or Blob[] when multiple:true).
   */
  function heic2any(options: Heic2AnyOptions): Promise<Blob | Blob[]>;

  export = heic2any;
}
