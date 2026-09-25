import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// 1. Get Channel Profile & Videos
router.get('/:username', async (req, res) => {
  try {
    const username = String(req.params.username);

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        createdAt: true,
        videos: {
          where: { status: 'READY' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            thumbnailUrl: true,
            views: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            subscribers: true,
            videos: { where: { status: 'READY' } },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Channel not found.' });
    }

    const formattedVideos = user.videos.map((v) => ({
      ...v,
      views: v.views.toString(),
    }));

    return res.status(200).json({
      channel: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        subscribersCount: user._count.subscribers,
        totalVideos: user._count.videos,
        videos: formattedVideos,
      },
    });
  } catch (error) {
    console.error('Fetch channel error:', error);
    return res.status(500).json({ error: 'Failed to fetch channel details.' });
  }
});

// 2. Toggle Subscribe / Unsubscribe by Channel ID or Username
router.post(
  '/:idOrUsername/subscribe',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idOrUsername = String(req.params.idOrUsername);
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        return res.status(401).json({ error: 'Unauthorized: User ID not found in token.' });
      }

      const targetChannel = await prisma.user.findFirst({
        where: {
          OR: [{ id: idOrUsername }, { username: idOrUsername }],
        },
      });

      if (!targetChannel) {
        return res.status(404).json({ error: 'Target channel not found.' });
      }

      const channelId = targetChannel.id;

      if (channelId === currentUserId) {
        return res.status(400).json({ error: 'You cannot subscribe to your own channel.' });
      }

      const existing = await prisma.subscription.findUnique({
        where: {
          userId_channelId: {
            userId: currentUserId,
            channelId: channelId,
          },
        },
      });

      if (existing) {
        await prisma.subscription.delete({
          where: {
            userId_channelId: {
              userId: currentUserId,
              channelId: channelId,
            },
          },
        });
        return res.status(200).json({ subscribed: false, message: 'Unsubscribed successfully.' });
      }

      await prisma.subscription.create({
        data: {
          userId: currentUserId,
          channelId: channelId,
        },
      });

      return res.status(200).json({ subscribed: true, message: 'Subscribed successfully.' });
    } catch (error: any) {
      console.error('Subscription error details:', error);
      return res.status(500).json({
        error: error.message || 'Failed to update subscription.',
      });
    }
  }
);

// 3. Check Subscription Status
router.get(
  '/:idOrUsername/is-subscribed',
  authenticateToken,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idOrUsername = String(req.params.idOrUsername);
      const currentUserId = req.user?.userId;

      if (!currentUserId) {
        return res.status(200).json({ subscribed: false });
      }

      const targetChannel = await prisma.user.findFirst({
        where: {
          OR: [{ id: idOrUsername }, { username: idOrUsername }],
        },
      });

      if (!targetChannel) {
        return res.status(200).json({ subscribed: false });
      }

      const sub = await prisma.subscription.findUnique({
        where: {
          userId_channelId: {
            userId: currentUserId,
            channelId: targetChannel.id,
          },
        },
      });

      return res.status(200).json({ subscribed: Boolean(sub) });
    } catch {
      return res.status(200).json({ subscribed: false });
    }
  }
);

export default router;