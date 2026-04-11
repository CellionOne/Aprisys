import { Client } from '@replit/object-storage';

let storageClient: Client | null = null;

function getClient(): Client {
  if (!storageClient) {
    storageClient = new Client();
  }
  return storageClient;
}

export async function uploadFile(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
  const client = getClient();
  const result = await client.uploadFromBytes(key, buffer);
  if (!result.ok) {
    throw new Error(`Failed to upload file "${key}": ${String(result.error)}`);
  }
}

export async function downloadFile(key: string): Promise<Buffer> {
  const client = getClient();
  const result = await client.downloadAsBytes(key);
  if (!result.ok) {
    throw new Error(`Failed to download file "${key}": ${String(result.error)}`);
  }
  return result.value[0];
}

export async function deleteFile(key: string): Promise<void> {
  const client = getClient();
  await client.delete(key);
}

export async function getSignedUrl(key: string): Promise<string> {
  return `${process.env.APP_URL}/storage/download?key=${encodeURIComponent(key)}`;
}

export function buildStorageKey(folder: string, subscriberId: string, filename: string): string {
  const uuid = crypto.randomUUID();
  const ext = filename.split('.').pop();
  return `${folder}/${subscriberId}/${uuid}.${ext}`;
}
