/**
 * OpenAI 兼容 LLM 客户端（公网部署用）。
 *
 * 智谱 / DeepSeek / Kimi / OpenAI 等任何 OpenAI 兼容接口均可通过环境变量接入：
 *   LLM_API_KEY  必填 · 接口密钥
 *   LLM_BASE_URL 选填 · 默认 https://open.bigmodel.cn/api/paas/v4（智谱开放平台）
 *   LLM_MODEL    选填 · 默认 glm-4-flash（智谱免费模型）
 *
 * 未配置 LLM_API_KEY 时，调用方应回退到本地运行环境的内置 SDK（沙箱预览路径）。
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function chatCompletionOpenAI(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  timeoutMs?: number;
}): Promise<ChatCompletionResult> {
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        temperature: 0.9,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status} ${detail.slice(0, 160)}`);
    }
    return (await res.json()) as ChatCompletionResult;
  } finally {
    clearTimeout(timer);
  }
}
