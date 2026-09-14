function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ordered list of Gemini models to try when the primary one is rate-limited,
 * quota-exhausted, or temporarily unavailable. Different models draw from
 * separate free-tier quota pools, so falling through keeps AI features working
 * instead of collapsing to the local templates. Override with
 * GEMINI_MODEL_FALLBACKS="modelA,modelB".
 */
function getModelFallbacks(primaryModel) {
  const envList = String(process.env.GEMINI_MODEL_FALLBACKS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  // Order matters: models that reliably complete large JSON payloads within
  // the token budget come first. The lite models are fast/cheap and finish
  // JSON cleanly; the newer "thinking" models can burn the budget on internal
  // reasoning and truncate, so they are tried after the reliable ones.
  const defaults = [
    'gemini-3.6-flash',
    'gemini-flash-lite-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
  ];
  const chain = [primaryModel, ...envList, ...defaults]
    .filter(Boolean)
    // de-duplicate while preserving order
    .filter((m, i, arr) => arr.indexOf(m) === i);
  return chain;
}

/** True when the error means "this model can't serve us right now", so trying
 *  a different model is worthwhile (quota, rate limit, overloaded, missing). */
function isModelLevelFailure(err) {
  const status = (err && (err.status || (err.body && err.body.error && err.body.error.code))) || 0;
  const body = err && (err.body ? (typeof err.body === 'string' ? err.body : JSON.stringify(err.body)) : '');
  const message = (err && (err.message || String(err))) || '';
  const combined = `${message} ${body}`;
  if (status === 429 || status === 503 || status === 404) return true;
  return /RESOURCE_EXHAUSTED|quota|rate limit|429|503|UNAVAILABLE|high demand|no longer available|NOT_FOUND|not found|overloaded/i.test(combined);
}

/**
 * Call `client.models.generateContent` with simple retry/backoff for transient
 * 5xx / UNAVAILABLE errors. Returns the provider response or throws the last
 * error.
 */
async function generateContentWithRetry(client, params, opts = {}) {
  // When the caller supplies a model, transparently fall through a chain of
  // alternative models if it fails for quota/availability reasons. This is what
  // keeps the AI working once a single model's daily free-tier quota is spent.
  if (params && params.model && opts.disableModelFallback !== true) {
    const chain = getModelFallbacks(params.model);
    let lastChainErr;
    for (let i = 0; i < chain.length; i += 1) {
      const model = chain[i];
      try {
        if (i > 0) console.warn(`GenAI: trying fallback model '${model}' (attempt ${i + 1}/${chain.length}).`);
        const resp = await generateContentWithRetry(client, { ...params, model }, { ...opts, disableModelFallback: true });
        // Some models (e.g. newer "thinking" Gemini models) spend the token
        // budget on internal reasoning and truncate the visible answer, which
        // breaks JSON-mode callers. Treat a truncated response as a
        // model-level failure so we fall through to a model that completes.
        const finishReason = resp && resp.candidates && resp.candidates[0] && resp.candidates[0].finishReason;
        if (finishReason === 'MAX_TOKENS' && i < chain.length - 1) {
          console.warn(`GenAI: model '${model}' hit MAX_TOKENS (truncated); trying a fallback model.`);
          lastChainErr = new Error(`Model ${model} truncated output (MAX_TOKENS)`);
          continue;
        }
        return resp;
      } catch (err) {
        lastChainErr = err;
        if (!isModelLevelFailure(err)) throw err;
      }
    }
    throw lastChainErr || new Error('All Gemini models failed');
  }

  // Increase retry attempts and use a slightly larger base delay to
  // better tolerate transient provider-side load spikes (503/UNAVAILABLE).
  const maxAttempts = opts.maxAttempts || 4;
  const baseDelay = opts.baseDelay || 300; // ms
  let attempt = 0;
  let lastErr;
  while (attempt < maxAttempts) {
    try {
      const resp = await client.models.generateContent(params);
      return resp;
    } catch (err) {
      lastErr = err;
      const status = err && (err.status || (err.body && err.body.error && err.body.error.code)) || 0;
      const body = err && (err.body ? (typeof err.body === 'string' ? err.body : JSON.stringify(err.body)) : '');
      const message = err && (err.message || String(err)) || '';
      const combined = `${message} ${body}`;

      // If it's a client error (4xx) other than 429, don't retry
      if (status >= 400 && status < 500 && status !== 429) {
        throw err;
      }

      // If message/body indicates permanent failure, don't retry
      if (/model not found|invalid model|permission denied/i.test(combined)) {
        throw err;
      }

      // Quota / rate-limit errors are not worth retrying in a tight loop:
      // the free tier is a hard daily cap (e.g. 20 requests/day) and Google
      // asks us to wait tens of seconds. Retrying just burns the remaining
      // budget and delays the real fallback, so fail fast and let the caller
      // decide. Short per-minute rate limits are still retryable.
      const isQuotaExhausted = /RESOURCE_EXHAUSTED|quota|exceeded your current quota/i.test(combined);
      const retryDelayMatch = combined.match(/retry in (\d+(?:\.\d+)?)s/i);
      const retryDelaySeconds = retryDelayMatch ? parseFloat(retryDelayMatch[1]) : 0;
      if (isQuotaExhausted && retryDelaySeconds > 15) {
        console.warn(`GenAI quota exhausted (retry in ~${Math.round(retryDelaySeconds)}s); not retrying to preserve quota.`);
        throw err;
      }

      attempt += 1;
      if (attempt >= maxAttempts) break;

      // exponential backoff with jitter
      const delay = Math.round(baseDelay * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4));
      console.warn(`GenAI call failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms:`, message || body);
      await sleep(delay);
    }
  }
  // final throw
  throw lastErr || new Error('Unknown error from GenAI provider');
}

module.exports = { generateContentWithRetry, getModelFallbacks, isModelLevelFailure };
