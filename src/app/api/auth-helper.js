import path from 'path';
import fs from 'fs';

/**
 * Loads GCP credentials from the GOOGLE_APPLICATION_CREDENTIALS env var.
 * The env var should point to the JSON key file path (e.g. "./key-gcp.json").
 * Returns { credentials, projectId } if the file is found and parseable,
 * otherwise returns nulls so the GCP SDKs fall back to ADC.
 */
export function getAuthOptions(fallbackProjectId = 'algolab-492207') {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (credPath) {
    try {
      const resolved = path.resolve(/* turbopackIgnore: true */ process.cwd(), credPath);
      const raw = fs.readFileSync(resolved, 'utf-8');
      const credentials = JSON.parse(raw);
      return {
        credentials,
        projectId: credentials.project_id || fallbackProjectId
      };
    } catch (e) {
      console.error('Failed to load GCP credentials from', credPath, e.message);
    }
  }

  return {
    credentials: null,
    projectId: fallbackProjectId
  };
}
