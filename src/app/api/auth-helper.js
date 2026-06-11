import path from 'path';
import fs from 'fs';

/**
 * Loads GCP credentials using two strategies:
 * 
 * 1. GCP_SERVICE_ACCOUNT_KEY env var (for Vercel/cloud deployment)
 *    → Paste the ENTIRE key-gcp.json content as the value
 * 
 * 2. GOOGLE_APPLICATION_CREDENTIALS env var (for local dev)
 *    → Points to the JSON key file path, e.g. "./key-gcp.json"
 */
export function getAuthOptions(fallbackProjectId = 'algolab-492207') {
  // Strategy 1: Full JSON pasted as env var (Vercel deployment)
  if (process.env.GCP_SERVICE_ACCOUNT_KEY) {
    try {
      const credentials = JSON.parse(process.env.GCP_SERVICE_ACCOUNT_KEY);
      return {
        credentials,
        projectId: credentials.project_id || fallbackProjectId
      };
    } catch (e) {
      console.error('Failed to parse GCP_SERVICE_ACCOUNT_KEY:', e.message);
    }
  }

  // Strategy 2: File path reference or direct JSON in GOOGLE_APPLICATION_CREDENTIALS
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credPath) {
    const trimmed = credPath.trim();
    if (trimmed.startsWith('{')) {
      try {
        const credentials = JSON.parse(trimmed);
        // Remove it from environment variables so GCP SDK doesn't attempt to load it as a file path
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        return {
          credentials,
          projectId: credentials.project_id || fallbackProjectId
        };
      } catch (e) {
        console.error('Failed to parse GOOGLE_APPLICATION_CREDENTIALS JSON directly:', e.message);
      }
    }

    try {
      const resolved = path.resolve(/* turbopackIgnore: true */ process.cwd(), credPath);
      const raw = fs.readFileSync(resolved, 'utf-8');
      const credentials = JSON.parse(raw);
      return {
        credentials,
        projectId: credentials.project_id || fallbackProjectId
      };
    } catch (e) {
      console.error('Failed to load credentials from file:', credPath, e.message);
    }
  }

  return {
    credentials: null,
    projectId: fallbackProjectId
  };
}
