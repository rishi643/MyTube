import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 1. Get Video Engagement Metrics & Comments
router.get('/videos/:id/interactions', async (req, res) => {
  try {
    const videoId = String(req.params.id);

    const [likes, dislikes, comments] = await Promise.all([
      prisma.like.count({ where: { videoId, isLike: true } }),
      prisma.like.count({ where: { videoId, isLike: false } }),
      prisma.comment.findMany({
        where: { videoId },
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return res.status(200).json({ likes, dislikes, comments });
  } catch (error) {
    console.error('Fetch interaction error:', error);
    return res.status(500).json({ error: 'Failed to fetch video interactions.' });
  }
});

// 2. Like or Dislike Video
router.post(
  '/videos/:id/like',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const videoId = String(req.params.id);
      const { isLike } = req.body;
      const userId = req.user!.userId;

      if (typeof isLike !== 'boolean') {
        return res.status(400).json({ error: 'Field isLike must be a boolean.' });
      }

      const existingVote = await prisma.like.findUnique({
        where: { userId_videoId: { userId, videoId } },
      });

      if (existingVote) {
        if (existingVote.isLike === isLike) {
          await prisma.like.delete({
            where: { userId_videoId: { userId, videoId } },
          });
          return res.status(200).json({ message: 'Vote removed.' });
        } else {
          await prisma.like.update({
            where: { userId_videoId: { userId, videoId } },
            data: { isLike },
          });
          return res.status(200).json({ message: 'Vote updated.' });
        }
      }

      await prisma.like.create({
        data: { userId, videoId, isLike },
      });

      return res.status(201).json({ message: 'Vote registered.' });
    } catch (error) {
      console.error('Vote error:', error);
      return res.status(500).json({ error: 'Failed to submit vote.' });
    }
  }
);

// 3. Post a Comment
router.post(
  '/videos/:id/comments',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const videoId = String(req.params.id);
      const { content } = req.body;
      const userId = req.user!.userId;

      if (!content || !content.trim()) {
        return res.status(400).json({ error: 'Comment content cannot be empty.' });
      }

      const newComment = await prisma.comment.create({
        data: {
          content: content.trim(),
          userId,
          videoId,
        },
        include: {
          user: {
            select: { id: true, username: true, avatarUrl: true },
          },
        },
      });

      return res.status(201).json({ comment: newComment });
    } catch (error) {
      console.error('Comment error:', error);
      return res.status(500).json({ error: 'Failed to post comment.' });
    }
  }
);

// 4. Track Video Playback Progress (Watch History)
// Track playback progress & increment authentic view
router.post('/videos/:id/progress', async (req, res) => {
  try {
    const videoId = String(req.params.id);
    const { progressSec, completed } = req.body;

    // Increment view count only once when playback crosses the 5s threshold
    if (progressSec >= 5 && progressSec <= 10) {
      await prisma.video.update({
        where: { id: videoId },
        data: { views: { increment: 1 } },
      });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to record progress' });
  }
});

// 5. Retrieve Playback Resume Point
router.get(
  '/videos/:id/progress',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const videoId = String(req.params.id);
      const userId = req.user!.userId;

      const history = await prisma.watchHistory.findUnique({
        where: {
          userId_videoId: { userId, videoId },
        },
      });

      return res.status(200).json({
        progressSec: history ? history.progressSec : 0,
        completed: history ? history.completed : false,
      });
    } catch (error) {
      console.error('Fetch resume point error:', error);
      return res.status(500).json({ error: 'Failed to fetch resume point.' });
    }
  }
);

// 6. Fetch User Watch History Feed
router.get(
  '/history',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user!.userId;

      const historyItems = await prisma.watchHistory.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: {
          video: {
            include: {
              user: {
                select: { id: true, username: true, avatarUrl: true },
              },
            },
          },
        },
      });

      const formatted = historyItems.map((item) => ({
        id: item.id,
        progressSec: item.progressSec,
        completed: item.completed,
        updatedAt: item.updatedAt,
        video: {
          ...item.video,
          views: item.video.views.toString(),
        },
      }));

      return res.status(200).json({ history: formatted });
    } catch (error) {
      console.error('History fetch error:', error);
      return res.status(500).json({ error: 'Failed to retrieve watch history.' });
    }
  }
);

export default router;