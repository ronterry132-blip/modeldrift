const MODEL_ID =
  /^(?:[a-z0-9][a-z0-9_-]{0,40}\/)?(?:gpt|chatgpt|claude|gemini|gemma|mistral|mixtral|llama|command-r|grok|qwen|deepseek|sonar|codestral|pixtral|jamba|dbrx|granite|phi|o[1-9])[a-z0-9._:/-]*$/i;

/** True when a literal looks like an LLM id and not an ordinary word. */
export function looksLikeModelId(value: string): boolean {
  if (value.length < 4 || value.length > 120) return false;
  if (!MODEL_ID.test(value)) return false;
  const bare = value.includes("/") ? value.slice(value.lastIndexOf("/") + 1) : value;
  return /[-.]/.test(bare) || /\d/.test(bare);
}
