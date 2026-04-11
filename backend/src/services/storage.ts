import { Client } from '@replit/object-storage';

let storageClient: Client | null = null;

function getClient(): Client {
  if (!storageClient) {
    storageClient = new Client();
  }
  return storageClient;
}

export async function uploadFile(key: string, buffer: Buffer, mimeType: string): Promise<void> {
  const client = getClient();
  await (client as any).uploadFromBytes(key, buffer, { contentType: mimeType });
}

export async function downloadFile(key: string): Promise<Buffer> {
  const client = getClient();
  const result = await client.downloadAsBytes(key);
  return Buffer.from(result.value as unknown as ArrayBuffer);
}

export async function deleteFile(key: string): Promise<void> {
  const client = getClient();
  await client.delete(key);
}

export async function getSignedUrl(key: string): Promise<string> {
  // Replit Object Storage doesn't have native signed URLs
  // Route through our own download endpoint which validates auth
  return `${process.env.APP_URL}/storage/download?key=${encodeURIComponent(key)}`;
}

export function buildStorageKey(folder: string, subscriberId: string, filename: string): string {
  const uuid = crypto.randomUUID();
  const ext = filename.split('.').pop();
  return `${folder}/${subscriberId}/${uuid}.${ext}`;
}
