import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Readable } from 'stream';

dotenv.config();

const S3_REGION = process.env.AWS_REGION || 'auto';
const S3_ENDPOINT = process.env.AWS_ENDPOINT; // For Cloudflare R2 / MinIO
const S3_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const S3_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
export const S3_BUCKET_NAME = process.env.AWS_BUCKET_NAME || 'mytube-media';

export const s3 = new S3Client({
  region: S3_REGION,
  endpoint: S3_ENDPOINT ? S3_ENDPOINT : undefined,
  credentials: {
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
  },
});

export const createPresignedUploadUrl = async (
  key: string,
  contentType: string
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3, command, { expiresIn: 900 });
};

export const downloadS3ObjectToFile = async (
  key: string,
  localDestinationPath: string
): Promise<void> => {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: key,
  });

  const response = await s3.send(command);
  const stream = response.Body as Readable;

  return new Promise((resolve, reject) => {
    const dir = path.dirname(localDestinationPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fileStream = fs.createWriteStream(localDestinationPath);
    stream.pipe(fileStream);
    stream.on('error', reject);
    fileStream.on('finish', () => resolve());
    fileStream.on('error', reject);
  });
};