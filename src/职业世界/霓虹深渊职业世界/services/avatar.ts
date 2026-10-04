const DEFAULT_MAX_AVATAR_SIZE = 256;
const DEFAULT_AVATAR_QUALITY = 0.86;

export interface AvatarResizeOptions {
  maxSize?: number;
  quality?: number;
}

function clampPositiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function fitWithin(width: number, height: number, maxSize: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    return { width: maxSize, height: maxSize };
  }

  const scale = Math.min(1, maxSize / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('头像图片加载失败。'));
    image.src = source;
  });
}

function exportCanvas(canvas: HTMLCanvasElement, quality: number): string {
  try {
    return canvas.toDataURL('image/webp', quality);
  } catch {
    return canvas.toDataURL('image/jpeg', quality);
  }
}

export async function fileToAvatarDataUrl(file: File, options: AvatarResizeOptions = {}): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('请选择图片文件。');
  }

  const maxSize = clampPositiveNumber(options.maxSize ?? DEFAULT_MAX_AVATAR_SIZE, DEFAULT_MAX_AVATAR_SIZE);
  const quality = Math.min(Math.max(options.quality ?? DEFAULT_AVATAR_QUALITY, 0.4), 0.95);
  const source = URL.createObjectURL(file);

  try {
    const image = await loadImage(source);
    const { width, height } = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, maxSize);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('当前环境不支持头像处理。');
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return exportCanvas(canvas, quality);
  } finally {
    URL.revokeObjectURL(source);
  }
}
