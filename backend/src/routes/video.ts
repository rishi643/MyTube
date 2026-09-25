import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient, VideoStatus } from '@prisma/client';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';
import { transcodeQueue } from '../lib/queue';
import { createPresignedUploadUrl } from '../services/s3';

const router = Router();
const prisma = new PrismaClient();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'video') {
      cb(null, 'uploads/videos');
    } else if (file.fieldname === 'thumbnail') {
      cb(null, 'uploads/thumbnails');
    } else {
      cb(new Error('Invalid fieldname'), '');
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video' && !file.mimetype.startsWith('video/')) {
      return cb(new Error('Only video files are allowed'));
    }
    if (file.fieldname === 'thumbnail' && !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed for thumbnails'));
    }
    cb(null, true);
  },
});

// 1. Generate Presigned URL for Direct Object Storage Upload
router.post(
  '/presigned-url',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { filename, contentType } = req.body;

      if (!filename || !contentType) {
        return res.status(400).json({ error: 'filename and contentType are required.' });
      }

      const ext = path.extname(filename);
      const uniqueKey = `raw/${uuidv4()}${ext}`;

      const uploadUrl = await createPresignedUploadUrl(uniqueKey, contentType);

      return res.status(200).json({
        uploadUrl,
        key: uniqueKey,
      });
    } catch (error) {
      console.error('Presigned URL error:', error);
      return res.status(500).json({ error: 'Failed to create presigned upload URL.' });
    }
  }
);

// 2. Complete S3 Upload & Queue Transcode
router.post(
  '/upload-complete',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { title, description, storageKey } = req.body;

      if (!title || !storageKey) {
        return res.status(400).json({ error: 'Title and storageKey are required.' });
      }

      const newVideo = await prisma.video.create({
        data: {
          title,
          description: description || '',
          hlsMasterUrl: storageKey,
          status: VideoStatus.PROCESSING,
          userId: req.user!.userId,
        },
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true },
          },
        },
      });

      await transcodeQueue.add('transcode', {
        videoId: newVideo.id,
        rawVideoRelativePath: storageKey,
      });

      return res.status(201).json({
        message: 'Video registered. Queued for transcoding.',
        video: {
          ...newVideo,
          views: newVideo.views.toString(),
        },
      });
    } catch (error) {
      console.error('Upload complete error:', error);
      return res.status(500).json({ error: 'Failed to register video.' });
    }
  }
);

// 3. Local Multipart Upload Fallback
router.post(
  '/upload',
  authenticateToken,
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
  ]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const { title, description } = req.body;

      if (!title) {
        return res.status(400).json({ error: 'Video title is required.' });
      }

      if (!files || !files['video'] || files['video'].length === 0) {
        return res.status(400).json({ error: 'Video file is required.' });
      }

      const videoFile = files['video'][0];
      const thumbnailFile = files['thumbnail'] ? files['thumbnail'][0] : null;

      const rawVideoPath = `/uploads/videos/${videoFile.filename}`;
      const thumbnailPath = thumbnailFile ? `/uploads/thumbnails/${thumbnailFile.filename}` : null;

      const newVideo = await prisma.video.create({
        data: {
          title,
          description: description || '',
          hlsMasterUrl: rawVideoPath,
          thumbnailUrl: thumbnailPath,
          status: VideoStatus.PROCESSING,
          userId: req.user!.userId,
        },
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true },
          },
        },
      });

      await transcodeQueue.add('transcode', {
        videoId: newVideo.id,
        rawVideoRelativePath: rawVideoPath,
      });

      return res.status(201).json({
        message: 'Video upload received. Queued for transcoding.',
        video: {
          ...newVideo,
          views: newVideo.views.toString(),
        },
      });
    } catch (error) {
      console.error('Video upload error:', error);
      return res.status(500).json({ error: 'Internal server error during upload.' });
    }
  }
);

// 4. Update / Replace Video Thumbnail
router.post(
  '/:id/thumbnail',
  authenticateToken,
  upload.single('thumbnail'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const videoId = String(req.params.id);
      const userId = req.user!.userId;

      if (!req.file) {
        return res.status(400).json({ error: 'No thumbnail image file uploaded.' });
      }

      const video = await prisma.video.findUnique({
        where: { id: videoId },
        select: { userId: true },
      });

      if (!video) {
        return res.status(404).json({ error: 'Video not found.' });
      }

      if (video.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden: You do not own this video.' });
      }

      const thumbnailPath = `/uploads/thumbnails/${req.file.filename}`;

      const updated = await prisma.video.update({
        where: { id: videoId },
        data: {
          thumbnailUrl: thumbnailPath,
        },
      });

      return res.status(200).json({
        message: 'Thumbnail updated successfully.',
        thumbnailUrl: updated.thumbnailUrl,
      });
    } catch (error) {
      console.error('Thumbnail upload error:', error);
      return res.status(500).json({ error: 'Failed to update thumbnail.' });
    }
  }
);

// 5. "Your Videos" / Content Studio Query
router.get('/me/videos', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const userVideos = await prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        thumbnailUrl: true,
        status: true,
        views: true,
        tags: true,
        createdAt: true,
      },
    });

    const formatted = userVideos.map((v) => ({
      ...v,
      views: v.views.toString(),
    }));

    return res.status(200).json({ videos: formatted });
  } catch (error) {
    console.error('Fetch user videos error:', error);
    return res.status(500).json({ error: 'Failed to fetch your videos.' });
  }
});

// 6. Recommended Feed
router.get('/', async (req, res) => {
  try {
    const videos = await prisma.video.findMany({
      where: { status: VideoStatus.READY },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const formattedVideos = videos.map((v) => ({
      ...v,
      views: v.views.toString(),
    }));

    return res.status(200).json({ videos: formattedVideos });
  } catch (error) {
    console.error('Fetch feed error:', error);
    return res.status(500).json({ error: 'Failed to fetch video feed.' });
  }
});

// 7. Search Videos
router.get('/search', async (req, res) => {
  try {
    const q = req.query.q as string;

    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Search query is required.' });
    }

    const searchQuery = q.trim();

    const videos = await prisma.video.findMany({
      where: {
        status: VideoStatus.READY,
        OR: [
          { title: { contains: searchQuery, mode: 'insensitive' } },
          { description: { contains: searchQuery, mode: 'insensitive' } },
        ],
      },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { views: 'desc' },
      take: 30,
    });

    const formattedVideos = videos.map((v) => ({
      ...v,
      views: v.views.toString(),
    }));

    return res.status(200).json({ videos: formattedVideos });
  } catch (error) {
    console.error('Search query error:', error);
    return res.status(500).json({ error: 'Internal server error during search.' });
  }
});

// 8. Video Status Check
router.get('/:id/status', async (req, res) => {
  try {
    const id = String(req.params.id);

    const video = await prisma.video.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        hlsMasterUrl: true,
      },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    return res.status(200).json({
      id: video.id,
      status: video.status,
      hlsMasterUrl: video.hlsMasterUrl,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return res.status(500).json({ error: 'Failed to retrieve processing status.' });
  }
});

// 9. Update Video Metadata
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const videoId = String(req.params.id);
    const userId = req.user!.userId;
    const { title, description, tags } = req.body;

    const existingVideo = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true },
    });

    if (!existingVideo) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (existingVideo.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own videos.' });
    }

    const updatedVideo = await prisma.video.update({
      where: { id: videoId },
      data: {
        ...(title && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(Array.isArray(tags) && { tags }),
      },
    });

    return res.status(200).json({
      message: 'Video updated successfully.',
      video: {
        ...updatedVideo,
        views: updatedVideo.views.toString(),
      },
    });
  } catch (error) {
    console.error('Update video error:', error);
    return res.status(500).json({ error: 'Failed to update video metadata.' });
  }
});

// 10. Delete Video
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const videoId = String(req.params.id);
    const userId = req.user!.userId;

    const existingVideo = await prisma.video.findUnique({
      where: { id: videoId },
      select: { userId: true },
    });

    if (!existingVideo) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    if (existingVideo.userId !== userId) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own videos.' });
    }

    await prisma.video.delete({
      where: { id: videoId },
    });

    return res.status(200).json({ message: 'Video deleted successfully.' });
  } catch (error) {
    console.error('Delete video error:', error);
    return res.status(500).json({ error: 'Failed to delete video.' });
  }
});

// 11. Fetch Single Video (Read Only)
router.get('/:id', async (req, res) => {
  try {
    const id = String(req.params.id);

    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, username: true, avatarUrl: true },
        },
      },
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    return res.status(200).json({
      video: {
        ...video,
        views: video.views.toString(),
      },
    });
  } catch (error) {
    console.error('Fetch single video error:', error);
    return res.status(404).json({ error: 'Video not found.' });
  }
});

export default router;