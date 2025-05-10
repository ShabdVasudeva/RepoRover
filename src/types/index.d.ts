

// This file can be used to declare global types or augment existing ones.

// Example: If @types/adm-zip is not available or sufficient, you could add manual declarations here.
// However, @types/adm-zip exists, so this might not be strictly necessary
// unless specific module augmentation is needed.

// For now, keeping it empty as @types/adm-zip should cover basic usage.
// If you encounter type issues with adm-zip, you can add declarations like:
/*
declare module 'adm-zip' {
  class AdmZip {
    constructor(input?: string | Buffer);
    extractAllTo(targetPath: string, overwrite?: boolean): void;
    // Add other methods and properties you use
  }
  export = AdmZip;
}
*/

declare namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_APP_URL?: string; // Might still be useful for constructing URLs
      AUTH_SECRET?: string; // For session encryption
      // GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are removed
    }
  }
