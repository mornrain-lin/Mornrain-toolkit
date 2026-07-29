/**
 * Tencent Cloud Hunyuan Video Generation SDK Wrapper
 *
 * Production-ready TypeScript wrapper for Tencent Cloud VCLM (Video Creation with Language Model) API.
 * Supports both text-to-video and image-to-video generation.
 *
 * @example
 * ```typescript
 * import { createClient } from './lib/tencent-hunyuan-video';
 *
 * const client = createClient();
 *
 * // Text-to-video
 * const job = await client.submitTextToVideoJob('A cat running on grassland');
 * const result = await client.waitForJobCompletion(job.jobId, 'text');
 * console.log('Video URL:', result.resultVideoUrl);
 *
 * // Image-to-video
 * const job2 = await client.submitImageToVideoJob({ url: 'https://example.com/cat.jpg' });
 * const result2 = await client.waitForJobCompletion(job2.jobId, 'image');
 * console.log('Video URL:', result2.resultVideoUrl);
 * ```
 *
 * @see https://cloud.tencent.com/document/product/1616
 * @version 1.0.0
 */

import * as tencentcloud from 'tencentcloud-sdk-nodejs';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

const VclmClient = tencentcloud.vclm.v20240523.Client;

// ─── 配置类型 ────────────────────────────────────────────────────────────────

/**
 * 客户端配置选项
 */
export interface HunyuanVideoConfig {
  /** 腾讯云 SecretId */
  secretId: string;
  /** 腾讯云 SecretKey */
  secretKey: string;
  /** 地域，如 ap-guangzhou、ap-beijing */
  region?: string;
  /** 自定义 API 端点（可选） */
  endpoint?: string;
}

// ─── 文生视频类型 ─────────────────────────────────────────────────────────────

/**
 * 文生视频提交选项
 */
export interface TextToVideoOptions {
  /**
   * 视频分辨率，目前仅支持 720p
   * @default '720p'
   */
  resolution?: '720p';
  /**
   * 视频右下角水印标识，1=添加，0=不添加
   * 若平台已在控制台申请关闭标识，可设为 0
   * @default 1
   */
  logoAdd?: 0 | 1;
}

/**
 * 文生视频提交结果
 */
export interface TextToVideoJobResult {
  /** 任务 ID，用于后续查询 */
  jobId: string;
  /** 请求 ID */
  requestId: string;
}

/**
 * 文生视频任务状态
 */
export interface TextToVideoJobStatus {
  /** 任务状态 */
  status: 'WAIT' | 'RUN' | 'FAIL' | 'DONE';
  /** 错误码（FAIL 时有值） */
  errorCode?: string;
  /** 错误信息（FAIL 时有值） */
  errorMessage?: string;
  /** 结果视频 URL（DONE 时有值，24 小时内有效） */
  resultVideoUrl?: string;
  /** 请求 ID */
  requestId: string;
}

// ─── 图生视频类型 ─────────────────────────────────────────────────────────────

/**
 * 图片输入（URL 或 base64 二选一）
 */
export interface ImageInput {
  /** 图片 URL */
  url?: string;
  /** 图片 base64 编码（不含 data:image/xxx;base64, 前缀） */
  base64?: string;
}

/**
 * 图生视频提交选项
 */
export interface ImageToVideoOptions {
  /** 视频描述文本（可选） */
  prompt?: string;
  /**
   * 视频分辨率
   * @default '480p'
   */
  resolution?: '480p' | '720p' | '1080p';
  /**
   * 视频帧率
   * @default 30
   */
  fps?: 16 | 24 | 30;
  /**
   * 视频右下角水印标识，1=添加，0=不添加
   * @default 1
   */
  logoAdd?: 0 | 1;
}

/**
 * 图生视频提交结果
 */
export interface ImageToVideoJobResult {
  /** 任务 ID，用于后续查询 */
  jobId: string;
  /** 请求 ID */
  requestId: string;
}

/**
 * 图生视频任务状态
 */
export interface ImageToVideoJobStatus {
  /** 任务状态 */
  status: 'WAIT' | 'RUN' | 'FAIL' | 'DONE';
  /** 错误码（FAIL 时有值） */
  errorCode?: string;
  /** 错误信息（FAIL 时有值） */
  errorMessage?: string;
  /** 结果视频 URL（DONE 时有值，24 小时内有效） */
  resultVideoUrl?: string;
  /** 请求 ID */
  requestId: string;
}

// ─── 轮询选项 ─────────────────────────────────────────────────────────────────

/**
 * 等待任务完成的选项
 */
export interface WaitForCompletionOptions {
  /** 轮询间隔（毫秒），默认 5000 */
  pollInterval?: number;
  /** 最大等待时间（毫秒），默认 600000（10 分钟） */
  timeout?: number;
  /** 进度回调，每次轮询时触发 */
  onProgress?: (status: string) => void;
}

// ─── 客户端实现 ───────────────────────────────────────────────────────────────

/**
 * HunyuanVideoClient 封装腾讯云混元视频生成 SDK
 *
 * 支持文生视频（SubmitHunyuanToVideoJob）和图生视频（SubmitImageToVideoGeneralJob）两种模式。
 */
export class HunyuanVideoClient {
  private client: any;
  private config: HunyuanVideoConfig;

  constructor(config: HunyuanVideoConfig) {
    this.validateConfig(config);
    this.config = config;
    this.client = this.initializeClient();
  }

  /**
   * 初始化底层 SDK 客户端
   */
  private initializeClient(): any {
    const isSandbox = process.env.X_IDE_AUTH_PROXY !== undefined;
    const isMockCredentials =
      this.config.secretId === 'mock_secret_id' ||
      this.config.secretKey === 'mock_secret_key';
    const useSandbox = isSandbox && isMockCredentials;

    const clientConfig = {
      credential: {
        secretId: this.config.secretId,
        secretKey: this.config.secretKey,
      },
      region: this.config.region || 'ap-guangzhou',
      profile: {
        httpProfile: {
          endpoint:
            this.config.endpoint ||
            (useSandbox ? 'vclm.tencent_cloud.auth-proxy.local' : ''),
          protocol: useSandbox ? 'http:' : 'https:',
        },
      },
    };

    return new VclmClient(clientConfig);
  }

  /**
   * 校验配置参数
   */
  private validateConfig(config: HunyuanVideoConfig): void {
    if (!config.secretId) {
      throw new Error('SecretId 不能为空');
    }
    if (!config.secretKey) {
      throw new Error('SecretKey 不能为空');
    }
    if (config.secretId.trim() !== config.secretId) {
      throw new Error('SecretId 首尾含有空格，请检查');
    }
    if (config.secretKey.trim() !== config.secretKey) {
      throw new Error('SecretKey 首尾含有空格，请检查');
    }
  }

  // ─── 文生视频 ──────────────────────────────────────────────────────────────

  /**
   * 提交文生视频任务（SubmitHunyuanToVideoJob）
   *
   * 异步接口，提交后返回 jobId，需调用 getTextToVideoJobStatus 轮询结果。
   *
   * @param prompt - 视频描述文本，必填，最多 200 个字符
   * @param options - 可选参数
   * @returns 任务 ID 和请求 ID
   *
   * @example
   * ```typescript
   * const job = await client.submitTextToVideoJob('一只猫在草地上奔跑，写实风格');
   * console.log('任务 ID:', job.jobId);
   * ```
   */
  async submitTextToVideoJob(
    prompt: string,
    options?: TextToVideoOptions
  ): Promise<TextToVideoJobResult> {
    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Prompt 不能为空');
    }
    if (prompt.length > 200) {
      throw new Error('Prompt 长度不能超过 200 个字符');
    }

    try {
      const params: any = {
        Prompt: prompt,
        Resolution: options?.resolution || '720p',
        LogoAdd: options?.logoAdd ?? 1,
      };

      const response = await this.client.SubmitHunyuanToVideoJob(params);

      return {
        jobId: response.JobId,
        requestId: response.RequestId,
      };
    } catch (error: any) {
      throw new Error(`提交文生视频任务失败: ${error.message}`);
    }
  }

  /**
   * 查询文生视频任务状态（DescribeHunyuanToVideoJob）
   *
   * @param jobId - 任务 ID（由 submitTextToVideoJob 返回）
   * @returns 任务状态和结果
   *
   * @example
   * ```typescript
   * const status = await client.getTextToVideoJobStatus('job_123456');
   * if (status.status === 'DONE') {
   *   console.log('视频 URL:', status.resultVideoUrl);
   * }
   * ```
   */
  async getTextToVideoJobStatus(jobId: string): Promise<TextToVideoJobStatus> {
    if (!jobId || jobId.trim().length === 0) {
      throw new Error('JobId 不能为空');
    }

    try {
      const response = await this.client.DescribeHunyuanToVideoJob({ JobId: jobId });

      const result: TextToVideoJobStatus = {
        status: response.Status as 'WAIT' | 'RUN' | 'FAIL' | 'DONE',
        requestId: response.RequestId,
      };

      if (response.Status === 'FAIL') {
        result.errorCode = response.ErrorCode;
        result.errorMessage = response.ErrorMessage || '未知错误';
      } else if (response.Status === 'DONE') {
        result.resultVideoUrl = response.ResultVideoUrl;
      }

      return result;
    } catch (error: any) {
      throw new Error(`查询文生视频任务状态失败: ${error.message}`);
    }
  }

  // ─── 图生视频 ──────────────────────────────────────────────────────────────

  /**
   * 提交图生视频任务（SubmitImageToVideoGeneralJob）
   *
   * 异步接口，提交后返回 jobId，需调用 getImageToVideoJobStatus 轮询结果。
   *
   * @param image - 输入图片（URL 或 base64，必填）
   * @param options - 可选参数（prompt、resolution、fps、logoAdd）
   * @returns 任务 ID 和请求 ID
   *
   * @example
   * ```typescript
   * // 使用图片 URL
   * const job = await client.submitImageToVideoJob(
   *   { url: 'https://example.com/cat.jpg' },
   *   { prompt: '让这只猫动起来', resolution: '720p', fps: 24 }
   * );
   *
   * // 使用 base64
   * const job2 = await client.submitImageToVideoJob(
   *   { base64: base64ImageData },
   *   { resolution: '1080p' }
   * );
   * ```
   */
  async submitImageToVideoJob(
    image: ImageInput,
    options?: ImageToVideoOptions
  ): Promise<ImageToVideoJobResult> {
    if (!image.url && !image.base64) {
      throw new Error('image.url 或 image.base64 必须提供其中一个');
    }

    try {
      const params: any = {
        Resolution: options?.resolution || '480p',
        Fps: options?.fps || 30,
        LogoAdd: options?.logoAdd ?? 1,
      };

      if (image.url) {
        params.ImageUrl = image.url;
      } else if (image.base64) {
        params.ImageBase64 = image.base64;
      }

      if (options?.prompt) {
        params.Prompt = options.prompt;
      }

      const response = await this.client.SubmitImageToVideoGeneralJob(params);

      return {
        jobId: response.JobId,
        requestId: response.RequestId,
      };
    } catch (error: any) {
      throw new Error(`提交图生视频任务失败: ${error.message}`);
    }
  }

  /**
   * 查询图生视频任务状态（DescribeImageToVideoGeneralJob）
   *
   * @param jobId - 任务 ID（由 submitImageToVideoJob 返回）
   * @returns 任务状态和结果
   *
   * @example
   * ```typescript
   * const status = await client.getImageToVideoJobStatus('job_123456');
   * if (status.status === 'DONE') {
   *   console.log('视频 URL:', status.resultVideoUrl);
   * }
   * ```
   */
  async getImageToVideoJobStatus(jobId: string): Promise<ImageToVideoJobStatus> {
    if (!jobId || jobId.trim().length === 0) {
      throw new Error('JobId 不能为空');
    }

    try {
      const response = await this.client.DescribeImageToVideoGeneralJob({ JobId: jobId });

      const result: ImageToVideoJobStatus = {
        status: response.Status as 'WAIT' | 'RUN' | 'FAIL' | 'DONE',
        requestId: response.RequestId,
      };

      if (response.Status === 'FAIL') {
        result.errorCode = response.ErrorCode;
        result.errorMessage = response.ErrorMessage || '未知错误';
      } else if (response.Status === 'DONE') {
        result.resultVideoUrl = response.ResultVideoUrl;
      }

      return result;
    } catch (error: any) {
      throw new Error(`查询图生视频任务状态失败: ${error.message}`);
    }
  }

  // ─── 通用工具方法 ──────────────────────────────────────────────────────────

  /**
   * 轮询等待任务完成
   *
   * @param jobId - 任务 ID
   * @param type - 任务类型：'text'（文生视频）或 'image'（图生视频）
   * @param options - 轮询选项
   * @returns 最终任务状态
   *
   * @example
   * ```typescript
   * const result = await client.waitForJobCompletion(job.jobId, 'text', {
   *   pollInterval: 5000,
   *   timeout: 600000,
   *   onProgress: (status) => console.log('当前状态:', status)
   * });
   * console.log('视频 URL:', result.resultVideoUrl);
   * ```
   */
  async waitForJobCompletion(
    jobId: string,
    type: 'text' | 'image',
    options?: WaitForCompletionOptions
  ): Promise<TextToVideoJobStatus | ImageToVideoJobStatus> {
    const pollInterval = options?.pollInterval ?? 5000;
    const timeout = options?.timeout ?? 600000;
    const startTime = Date.now();

    while (true) {
      const status =
        type === 'text'
          ? await this.getTextToVideoJobStatus(jobId)
          : await this.getImageToVideoJobStatus(jobId);

      options?.onProgress?.(status.status);

      if (status.status === 'DONE') {
        return status;
      }

      if (status.status === 'FAIL') {
        throw new Error(
          `任务失败 [${status.errorCode || 'UNKNOWN'}]: ${status.errorMessage || '未知错误'}`
        );
      }

      if (Date.now() - startTime >= timeout) {
        throw new Error(`任务超时：等待 ${timeout / 1000} 秒后仍未完成`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * 提交文生视频并等待完成（一体化方法）
   *
   * @param prompt - 视频描述文本
   * @param jobOptions - 提交选项
   * @param waitOptions - 等待选项
   * @returns 最终任务状态（含视频 URL）
   *
   * @example
   * ```typescript
   * const result = await client.generateTextToVideo('一只猫在草地上奔跑', {
   *   logoAdd: 0
   * }, {
   *   onProgress: (status) => console.log('状态:', status)
   * });
   * console.log('视频 URL:', result.resultVideoUrl);
   * ```
   */
  async generateTextToVideo(
    prompt: string,
    jobOptions?: TextToVideoOptions,
    waitOptions?: WaitForCompletionOptions
  ): Promise<TextToVideoJobStatus> {
    const job = await this.submitTextToVideoJob(prompt, jobOptions);
    return (await this.waitForJobCompletion(
      job.jobId,
      'text',
      waitOptions
    )) as TextToVideoJobStatus;
  }

  /**
   * 提交图生视频并等待完成（一体化方法）
   *
   * @param image - 输入图片
   * @param jobOptions - 提交选项
   * @param waitOptions - 等待选项
   * @returns 最终任务状态（含视频 URL）
   *
   * @example
   * ```typescript
   * const result = await client.generateImageToVideo(
   *   { url: 'https://example.com/cat.jpg' },
   *   { resolution: '720p', fps: 24 },
   *   { onProgress: (status) => console.log('状态:', status) }
   * );
   * console.log('视频 URL:', result.resultVideoUrl);
   * ```
   */
  async generateImageToVideo(
    image: ImageInput,
    jobOptions?: ImageToVideoOptions,
    waitOptions?: WaitForCompletionOptions
  ): Promise<ImageToVideoJobStatus> {
    const job = await this.submitImageToVideoJob(image, jobOptions);
    return (await this.waitForJobCompletion(
      job.jobId,
      'image',
      waitOptions
    )) as ImageToVideoJobStatus;
  }

  /**
   * 下载视频到本地文件
   *
   * @param videoUrl - 视频 URL（由任务结果返回，24 小时内有效）
   * @param savePath - 本地保存路径，如 './output/video.mp4'
   *
   * @example
   * ```typescript
   * await client.downloadVideo(result.resultVideoUrl!, './output/video.mp4');
   * console.log('视频已保存');
   * ```
   */
  async downloadVideo(videoUrl: string, savePath: string): Promise<void> {
    if (!videoUrl) {
      throw new Error('视频 URL 不能为空');
    }

    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(savePath);
      https
        .get(videoUrl, (response) => {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(savePath, () => {});
          reject(new Error(`下载视频失败: ${err.message}`));
        });
    });
  }
}

// ─── 工厂函数 ─────────────────────────────────────────────────────────────────

/**
 * 创建 HunyuanVideoClient 实例（支持零配置）
 *
 * 自动检测 Genie 沙箱环境并配置 auth-proxy 端点。
 * 用户可通过环境变量覆盖默认配置。
 *
 * 配置优先级：
 * 1. 环境变量（如已设置）
 * 2. 沙箱默认值（在 Genie 环境中）
 * 3. 空值（两者均未配置时报错）
 *
 * @param config - 可选配置覆盖
 * @returns 配置好的 HunyuanVideoClient 实例
 *
 * @example
 * ```typescript
 * // 零配置（在 Genie 沙箱中使用 auth-proxy）
 * const client = createClient();
 *
 * // 使用自定义凭证
 * const client = createClient({
 *   secretId: process.env.TENCENTCLOUD_SECRET_ID!,
 *   secretKey: process.env.TENCENTCLOUD_SECRET_KEY!,
 * });
 * ```
 */
export function createClient(config?: Partial<HunyuanVideoConfig>): HunyuanVideoClient {
  const isSandbox = process.env.X_IDE_AUTH_PROXY !== undefined;

  // 优先级：环境变量 > 沙箱 mock 值 > 空字符串
  const secretId =
    process.env.TENCENTCLOUD_SECRET_ID || (isSandbox ? 'mock_secret_id' : '');
  const secretKey =
    process.env.TENCENTCLOUD_SECRET_KEY || (isSandbox ? 'mock_secret_key' : '');
  const region = process.env.TENCENTCLOUD_REGION || 'ap-guangzhou';

  return new HunyuanVideoClient({
    secretId,
    secretKey,
    region,
    ...config,
  });
}
