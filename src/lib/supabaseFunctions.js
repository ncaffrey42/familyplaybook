/**
 * Shared helpers for working with Supabase edge function responses from
 * the client.
 *
 * Why this exists: `supabase.functions.invoke()` wraps any non-2xx
 * response in a `FunctionsHttpError` whose message is the unhelpful
 * "Edge Function returned a non-2xx status code". The raw Response sits
 * on `error.context`. Our edge functions reply with
 * `{ error: <message>, success: false }`, so callers want the body's
 * `error` field surfaced in the toast instead of the wrapper message.
 */

/**
 * Turn a `FunctionsHttpError` (or any object with a `context` Response)
 * into a real Error carrying the server-side error message.
 *
 * Always returns an Error — never throws — so callers can `throw await
 * unpackFunctionsError(err)` without worrying about a second failure
 * path.
 *
 * @param {unknown} err
 * @returns {Promise<Error>}
 */
export async function unpackFunctionsError(err) {
  const response = err?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const body = await response.clone().json();
      if (body?.error) return new Error(body.error);
      if (body?.message) return new Error(body.message);
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return new Error(text);
      } catch {
        /* fall through */
      }
    }
  }
  return err instanceof Error ? err : new Error(String(err?.message || err));
}

/**
 * Wraps `supabase.functions.invoke` so callers get either the `data` or
 * a real Error to throw. Removes the boilerplate of `{ data, error }`
 * destructuring + error unpacking from every callsite.
 *
 * @example
 *   const data = await invokeFunction(supabase, 'change-subscription-plan', {
 *     body: { plan_key, billing_interval },
 *   });
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} name
 * @param {object} options
 * @returns {Promise<any>}
 */
export async function invokeFunction(supabase, name, options) {
  const { data, error } = await supabase.functions.invoke(name, options);
  if (error) throw await unpackFunctionsError(error);
  // Some functions return 200 with `{ success: false }` for known
  // soft-failures — treat those as errors too.
  if (data && data.success === false) {
    throw new Error(data.error || data.message || `${name} failed`);
  }
  return data;
}
