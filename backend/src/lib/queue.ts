import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export const redisConnection = new IORedis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  tls: REDIS_PASSWORD ? {} : undefined, // Upstash requires TLS enabled
  maxRetriesPerRequest: null,
});

export const TRANSCODE_QUEUE_NAME = 'video-transcode-queue';

export interface TranscodeJobPayload {
  videoId: string;
  rawVideoRelativePath: string;
}

export const transcodeQueue = new Queue<TranscodeJobPayload>(TRANSCODE_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});