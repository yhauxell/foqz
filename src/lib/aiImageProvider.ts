export interface GenerateImageOptions {
  prompt: string;
  provider?: 'auto' | 'openai' | 'gemini' | 'pollinations';
  model?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:2';
  apiKey?: string;
  baseUrl?: string;
}

export interface GenerateImageResult {
  url: string;
  revisedPrompt?: string;
  providerUsed: string;
  modelUsed: string;
  width: number;
  height: number;
}

function getDimensionsForAspectRatio(aspectRatio?: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 512, height: 288 };
    case '9:16':
      return { width: 288, height: 512 };
    case '4:3':
      return { width: 480, height: 360 };
    case '3:2':
      return { width: 480, height: 320 };
    case '1:1':
    default:
      return { width: 400, height: 400 };
  }
}

/**
 * Generate AI image using OpenAI (DALL-E 3), Google Imagen, or Pollinations fallback.
 */
export async function generateAiImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
  const { prompt, aspectRatio = '1:1' } = options;
  const dims = getDimensionsForAspectRatio(aspectRatio);

  const provider = options.provider || 'auto';
  const hasOpenAiKey = Boolean(options.apiKey?.trim());

  if ((provider === 'openai' || (provider === 'auto' && hasOpenAiKey)) && hasOpenAiKey) {
    try {
      const baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
      const model = options.model || 'dall-e-3';

      let size: '1024x1024' | '1792x1024' | '1024x1792' = '1024x1024';
      if (aspectRatio === '16:9' || aspectRatio === '3:2') size = '1792x1024';
      else if (aspectRatio === '9:16') size = '1024x1792';

      const res = await fetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey!.trim()}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size,
          response_format: 'b64_json',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const item = data.data?.[0];
        if (item?.b64_json) {
          return {
            url: `data:image/png;base64,${item.b64_json}`,
            revisedPrompt: item.revised_prompt || prompt,
            providerUsed: 'openai',
            modelUsed: model,
            width: dims.width,
            height: dims.height,
          };
        } else if (item?.url) {
          return {
            url: item.url,
            revisedPrompt: item.revised_prompt || prompt,
            providerUsed: 'openai',
            modelUsed: model,
            width: dims.width,
            height: dims.height,
          };
        }
      }
    } catch (e) {
      console.warn('OpenAI image generation failed, falling back to Pollinations:', e);
    }
  }

  // Pollinations AI (Zero config, free, offline-resilient fallback)
  const encodedPrompt = encodeURIComponent(prompt.trim());
  const seed = Math.floor(Math.random() * 1000000);
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${dims.width}&height=${dims.height}&seed=${seed}&nologo=true`;

  try {
    const res = await fetch(pollinationsUrl);
    if (res.ok) {
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return {
        url: dataUrl,
        revisedPrompt: prompt,
        providerUsed: 'pollinations',
        modelUsed: 'flux',
        width: dims.width,
        height: dims.height,
      };
    }
  } catch (e) {
    console.warn('Pollinations direct blob fetch failed, falling back to direct URL:', e);
  }

  return {
    url: pollinationsUrl,
    revisedPrompt: prompt,
    providerUsed: 'pollinations',
    modelUsed: 'flux',
    width: dims.width,
    height: dims.height,
  };
}
