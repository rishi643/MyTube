import { Worker, Job } from 'bullmq';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { redisConnection, TRANSCODE_QUEUE_NAME, TranscodeJobPayload } from './lib/queue';
import { transcodeToHLS, generateDefaultThumbnail } from './services/transcoder';
import { generateVideoInsights } from './services/ai';
import { downloadS3ObjectToFile } from './services/s3';

dotenv.config();

const prisma = new PrismaClient();

console.log('[Worker] Initializing Video Transcoding & AI Consumer...');

const worker = new Worker<TranscodeJobPayload>(
  TRANSCODE_QUEUE_NAME,
  async (job: Job<TranscodeJobPayload>) => {
    const { videoId, rawVideoRelativePath } = job.data;
    console.log(`[Worker] Starting transcode job ${job.id} for Video ID: ${videoId}`);

    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    if (!video) throw new Error(`Video ${videoId} not found`);

    let localVideoPath = rawVideoRelativePath;

    // Handle S3 objects: download temporarily to local disk for FFmpeg processing
    if (rawVideoRelativePath.startsWith('raw/')) {
      const ext = path.extname(rawVideoRelativePath);
      const tempLocal = path.join('uploads', 'temp', `${videoId}${ext}`);
      console.log(`[Worker] Downloading S3 asset ${rawVideoRelativePath} to ${tempLocal}`);
      await downloadS3ObjectToFile(rawVideoRelativePath, tempLocal);
      localVideoPath = `/${tempLocal.replace(/\\/g, '/')}`;
    }

    if (!video.thumbnailUrl) {
      console.log(`[Worker] Generating automatic thumbnail for Video ID: ${videoId}`);
      try {
        await generateDefaultThumbnail(localVideoPath, videoId);
      } catch (err) {
        console.warn(`[Worker] Thumbnail generation non-fatal error:`, err);
      }
    }

    const hlsMasterPath = await transcodeToHLS(localVideoPath, videoId);

    console.log(`[Worker] Generating AI insights for Video ID: ${videoId}`);
    const insights = await generateVideoInsights(video.title, video.description);

    await prisma.video.update({
      where: { id: videoId },
      data: {
        description: insights.summary,
        tags: insights.tags,
      },
    });

    // Cleanup temp downloaded file if it came from S3
    const fullTempPath = path.join(process.cwd(), localVideoPath);
    if (rawVideoRelativePath.startsWith('raw/') && fs.existsSync(fullTempPath)) {
      fs.unlinkSync(fullTempPath);
    }

    return { success: true, hlsMasterPath, insights };
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed successfully.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err);
});