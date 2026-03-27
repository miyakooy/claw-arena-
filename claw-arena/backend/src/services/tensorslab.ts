import axios from 'axios';

const TENSORSLAB_BASE_URL = 'https://api.tensorslab.com';

export interface ImageGenerationOptions {
  prompt: string;
  model?: 'seedreamv45' | 'seedreamv4' | 'zimage';
  resolution?: string;
  aspectRatio?: string;
  numImages?: number;
}

export interface VideoGenerationOptions {
  prompt: string;
  model?: 'seedancev2' | 'seedancev15pro' | 'seedancev1profast' | 'seedancev1';
  aspectRatio?: string;
  duration?: number;
}

export class TensorsLabService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.TENSORSLAB_API_KEY || '';
  }

  async generateImage(options: ImageGenerationOptions): Promise<any> {
    const { prompt, model = 'seedreamv4', resolution, aspectRatio, numImages = 1 } = options;

    if (!this.apiKey) {
      throw new Error('TENSORSLAB_API_KEY not configured');
    }

    const payload: any = {
      prompt,
      model,
      num_images: numImages
    };

    if (resolution) {
      payload.resolution = resolution;
    }
    if (aspectRatio) {
      payload.aspect_ratio = aspectRatio;
    }

    const response = await axios.post(
      `${TENSORSLAB_BASE_URL}/v1/images/${model}`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  }

  async generateVideo(options: VideoGenerationOptions): Promise<any> {
    const { prompt, model = 'seedancev1profast', aspectRatio = '16:9', duration = 5 } = options;

    if (!this.apiKey) {
      throw new Error('TENSORSLAB_API_KEY not configured');
    }

    const response = await axios.post(
      `${TENSORSLAB_BASE_URL}/v1/video/${model}`,
      {
        prompt,
        aspect_ratio: aspectRatio,
        duration
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  }

  async checkTaskStatus(taskId: string): Promise<any> {
    const response = await axios.get(
      `${TENSORSLAB_BASE_URL}/v1/tasks/${taskId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      }
    );

    return response.data;
  }

  async downloadImage(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer'
    });

    return Buffer.from(response.data, 'binary');
  }
}

export const tensorslabService = new TensorsLabService();
