const DEVELOPMENT_GOOGLE_CLOUD_PROJECT_ID = 'astral-pursuit-395520';

/**
 * Gets the Google Cloud project ID falling back to the development ID
 */
export function getGoogleCloudProjectId(): string {
  return (
    process.env.GOOGLE_CLOUD_PROJECT_ID ?? DEVELOPMENT_GOOGLE_CLOUD_PROJECT_ID
  );
}
