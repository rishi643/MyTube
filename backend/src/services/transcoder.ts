import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { PrismaClient, VideoStatus } from '@prisma/client';

const prisma = new PrismaClient();

interface Rendition {
  resolution: string;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
}

const RENDITIONS: Rendition[] = [
  { resolution: '1080p', width: 1920, height: 1080, videoBitrate: '4500k', audioBitrate: '192k' },
  { resolution: '720p', width: 1280, height: 720, videoBitrate: '2500k', audioBitrate: '128k' },
  { resolution: '480p', width: 854, height: 480, videoBitrate: '1000k', audioBitrate: '96k' },
];

export const generateDefaultThumbnail = async (
  rawVideoRelativePath: string,
  videoId: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const rootDir = process.cwd();
    const inputFilePath = path.join(rootDir, rawVideoRelativePath);
    const thumbnailDir = path.join(rootDir, 'uploads', 'thumbnails');

    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    const filename = `${videoId}-thumb.jpg`;

    ffmpeg(inputFilePath)
      .screenshots({
        timestamps: ['15%'],
        filename,
        folder: thumbnailDir,
        size: '1280x720',
      })
      .on('end', async () => {
        const publicThumbUrl = `/uploads/thumbnails/${filename}`;
        await prisma.video.update({
          where: { id: videoId },
          data: { thumbnailUrl: publicThumbUrl },
        });
        resolve(publicThumbUrl);
      })
      .on('error', (err) => {
        console.error(`[Thumbnail] Failed to generate thumbnail for ${videoId}:`, err);
        reject(err);
      });
  });
};

export const transcodeToHLS = async (
  rawVideoRelativePath: string,
  videoId: string
): Promise<string> => {
  return new Promise(async (resolve, reject) => {
    try {
      await prisma.video.update({
        where: { id: videoId },
        data: { status: VideoStatus.PROCESSING },
      });

      const rootDir = process.cwd();
      const inputFilePath = path.join(rootDir, rawVideoRelativePath);
      const hlsOutputDir = path.join(rootDir, 'uploads', 'hls', videoId);

      if (!fs.existsSync(hlsOutputDir)) {
        fs.mkdirSync(hlsOutputDir, { recursive: true });
      }

      for (const r of RENDITIONS) {
        const renditionDir = path.join(hlsOutputDir, r.resolution);
        if (!fs.existsSync(renditionDir)) {
          fs.mkdirSync(renditionDir, { recursive: true });
        }

        const renditionPlaylist = path.join(renditionDir, 'index.m3u8');

        await new Promise((res, rej) => {
          ffmpeg(inputFilePath)
            .size(`${r.width}x${r.height}`)
            .videoBitrate(r.videoBitrate)
            .audioBitrate(r.audioBitrate)
            .outputOptions([
              '-profile:v baseline',
              '-level 3.0',
              '-start_number 0',
              '-hls_time 6',
              '-hls_list_size 0',
              '-f hls',
            ])
            .output(renditionPlaylist)
            .on('end', () => res(true))
            .on('error', (err) => rej(err))
            .run();
        });
      }

      const masterContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=4700000,RESOLUTION=1920x1080,NAME="1080p"
1080p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2650000,RESOLUTION=1280x720,NAME="720p"
720p/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1100000,RESOLUTION=854x480,NAME="480p"
480p/index.m3u8
`;

      const masterPlaylistPath = path.join(hlsOutputDir, 'master.m3u8');
      fs.writeFileSync(masterPlaylistPath, masterContent, 'utf-8');

      const publicMasterPath = `/uploads/hls/${videoId}/master.m3u8`;

      await prisma.video.update({
        where: { id: videoId },
        data: {
          status: VideoStatus.READY,
          hlsMasterUrl: publicMasterPath,
        },
      });

      if (fs.existsSync(inputFilePath)) {
        fs.unlinkSync(inputFilePath);
      }

      resolve(publicMasterPath);
    } catch (err) {
      console.error(`[Transcoder] Failure on ${videoId}:`, err);
      await prisma.video.update({
        where: { id: videoId },
        data: { status: VideoStatus.FAILED },
      });
      reject(err);
    }
  });
};