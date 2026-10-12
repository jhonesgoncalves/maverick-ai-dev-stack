// Which model family a run belongs to. A judge must come from a different family than the
// agent that wrote the change (models rate their own family's output higher), and a stuck loop
// is best rescued by a different family too. The model name decides first, because several
// CLIs (Copilot, Cursor, Kiro, OpenCode, Antigravity) can run other vendors' models.

/** Model-name patterns, most specific first. */
const MODEL_FAMILY = [
  [/claude|opus|sonnet|haiku|fable/i, 'anthropic'],
  [/gpt|codex|^o\d|\bastra\b|\bsol\b/i, 'openai'],
  [/gemini|^(?:pro|flash|flash-lite)$/i, 'google'],
  [/grok/i, 'xai'],
  [/llama/i, 'meta'],
  [/mistral|codestral|devstral/i, 'mistral'],
  [/deepseek/i, 'deepseek'],
  [/qwen/i, 'qwen'],
  [/kimi|moonshot/i, 'moonshot']
];

/**
 * A provider's family when the model does not say. Only CLIs that run one vendor's models are
 * listed; the rest stay unknown until `runtime.families` names them, so independence is never
 * assumed.
 */
export const PROVIDER_FAMILY = { 'claude-code': 'anthropic', codex: 'openai', gemini: 'google', antigravity: 'google' };

/** `{ family, source }`: from the model name, then `runtime.families`, then the provider default, else unknown. */
export function familyOf({ provider, model } = {}, config = {}) {
  const id = typeof provider === 'string' ? provider : provider?.id;
  const byModel = model && MODEL_FAMILY.find(([pattern]) => pattern.test(String(model)));
  if (byModel) return { family: byModel[1], source: 'model' };
  const configured = config.runtime?.families?.[id];
  if (configured) return { family: configured, source: 'config' };
  if (PROVIDER_FAMILY[id]) return { family: PROVIDER_FAMILY[id], source: 'provider' };
  return { family: 'unknown', source: 'none' };
}
