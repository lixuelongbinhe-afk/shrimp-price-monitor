const INJECTION_PATTERNS = [
  /ignore (all|any|the|previous)/i,
  /system prompt/i,
  /developer message/i,
  /执行.{0,8}(命令|指令)/,
  /忽略.{0,12}(规则|要求|指令|提示)/,
  /泄露.{0,8}(密钥|key|prompt)/i,
  /你现在是/,
  /绕过.{0,8}(验证|限制|安全)/
];

export function detectPromptInjection(text: string): string | null {
  const pattern = INJECTION_PATTERNS.find((candidate) => candidate.test(text));
  return pattern ? `疑似提示词注入：${pattern.source}` : null;
}

export function redactSecrets(value: string, secrets: readonly string[]): string {
  return secrets.filter(Boolean).reduce((output, secret) => output.split(secret).join("[REDACTED]"), value);
}
