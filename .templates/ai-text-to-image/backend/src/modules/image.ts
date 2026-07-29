import { Router, Request, Response } from 'express'
import { requireAuth } from '../middleware/auth.middleware'
import { SaveImageSchema, GetImagesQuerySchema, DeleteImageSchema } from '../types/image.types'
import { logger } from '../config/logger'

// TODO: Use TCB CloudBase JS SDK on frontend for data storage

export const imageRouter = Router()

// 所有路由都需要认证
imageRouter.use(requireAuth)

/**
 * GET /api/images
 * 获取用户的所有图片
 */
imageRouter.get('/', async (req: Request, res: Response) => {
  const userId = req.user!.id

  // 验证查询参数
  const parseResult = GetImagesQuerySchema.safeParse(req.query)
  if (!parseResult.success) {
    return res.status(400).json({
      error: '参数错误',
      details: parseResult.error.flatten().fieldErrors,
    })
  }

  // TODO: Use TCB CloudBase JS SDK on frontend for data storage
  return res.json({
    images: [],
    pagination: {
      page: parseResult.data.page,
      limit: parseResult.data.limit,
      total: 0,
      totalPages: 0,
    },
  })
})

/**
 * POST /api/images
 * 保存图片到用户作品
 */
imageRouter.post('/', async (req: Request, res: Response) => {
  const userId = req.user!.id

  // 验证请求数据
  const parseResult = SaveImageSchema.safeParse(req.body)
  if (!parseResult.success) {
    return res.status(400).json({
      error: '参数错误',
      details: parseResult.error.flatten().fieldErrors,
    })
  }

  // TODO: Use TCB CloudBase JS SDK on frontend for data storage
  logger.info({ userId }, 'Image save requested')

  return res.status(201).json({
    ...parseResult.data,
    id: '',
    createdAt: new Date().toISOString(),
  })
})

/**
 * DELETE /api/images/:id
 * 删除图片
 */
imageRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = req.user!.id

  // 验证参数
  const parseResult = DeleteImageSchema.safeParse({ id: req.params.id })
  if (!parseResult.success) {
    return res.status(400).json({
      error: '参数错误',
      details: parseResult.error.flatten().fieldErrors,
    })
  }

  // TODO: Use TCB CloudBase JS SDK on frontend for data storage
  logger.info({ imageId: parseResult.data.id, userId }, 'Image delete requested')

  return res.json({ success: true })
})
