import React, { useState, useEffect, useRef, useId } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { addBreadcrumb } from '@/lib/errorLogger';

/**
 * Ask the Playbook — grounded Q&A over exactly the guides one share link
 * exposes (docs/platform/ASK_PLAYBOOK.md). Anonymous surface: no auth, no
 * conversational memory, single-turn.
 *
 * Nothing typed here is ever persisted. The visible Q&A list is local React
 * state that dies with the tab — the server keeps counts only (decision #4),
 * so this component must never log or send the question text anywhere else.
 *
 * Two verticals, one component: the retrieval path is identical and only the
 * copy changes (§1). A refusal is a first-class, composed state, not an
 * error (§6) — it is a frequent and intended answer.
 */

const COPY = {
  family: {
    heading: 'Ask this playbook',
    blurb: 'Answers come only from what the family shared on this page.',
    label: 'Ask this playbook a question',
    placeholder: 'e.g. can Ella have peanuts?',
    thinking: 'Looking through the playbook…',
    browse: 'The guides on this page are everything the family shared — worth a scroll.',
  },
  host: {
    heading: 'Ask about your stay',
    blurb: 'Answers come only from what your host shared on this page.',
    label: 'Ask a question about your stay',
    placeholder: 'e.g. what’s the wifi password?',
    thinking: 'Checking the guide…',
    browse: 'The guides on this page are everything your host shared — worth a scroll.',
  },
};

const ASK_FN = 'ask-playbook';

const AskPlaybook = ({ shareId, vertical = 'family' }) => {
  const copy = COPY[vertical] || COPY.family;
  const inputId = useId();
  const nextId = useRef(0);

  const [available, setAvailable] = useState(null); // null = unresolved
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);

  // Eligibility is the server's call (paid owner, live link, one workspace).
  // Anything other than an explicit true renders nothing at all: a guest on a
  // free owner's link must see no affordance, not a disabled one (decision #2).
  useEffect(() => {
    let cancelled = false;
    if (!shareId) return undefined;
    supabase
      .rpc('ask_playbook_available', { p_share_id: shareId })
      .then(({ data, error }) => {
        if (cancelled) return;
        setAvailable(!error && data === true);
      });
    return () => { cancelled = true; };
  }, [shareId]);

  const patch = (id, fields) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));

  const ask = async (e) => {
    e.preventDefault();
    const asked = question.trim();
    if (!asked || pending) return;

    const id = nextId.current++;
    setMessages((prev) => [...prev, { id, question: asked, state: 'pending' }]);
    setQuestion('');
    setPending(true);

    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${ASK_FN}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ share_id: shareId, question: asked }),
      });

      if (res.status === 429) {
        patch(id, { state: 'limit' });
        return;
      }

      let json = null;
      try { json = await res.json(); } catch { json = null; }

      if (!res.ok || !json || typeof json.answer !== 'string') {
        // Breadcrumb only — never the question, and never the raw body.
        addBreadcrumb('ask-playbook failed', { status: res.status });
        patch(id, { state: 'trouble' });
        return;
      }

      patch(id, {
        state: json.grounded ? 'answer' : 'refusal',
        answer: json.answer,
        sources: Array.isArray(json.sources) ? json.sources : [],
        remaining: typeof json.remaining === 'number' ? json.remaining : null,
      });
    } catch (err) {
      addBreadcrumb('ask-playbook network error', { message: err?.message });
      patch(id, { state: 'trouble' });
    } finally {
      setPending(false);
    }
  };

  // TODO: a source chip should deep-link to that guide's own share page
  // (/share/:shareId), the way the bundle rows above already do. The response
  // carries { guide_id, name } only, and a guide id is not a share id — a
  // guest can't resolve one. Wire this up once sources carry the per-guide
  // share id; until then the chip is a label that says where the answer came
  // from, and tapping it does nothing.
  const openSource = () => {};

  if (available !== true) return null;

  const last = messages[messages.length - 1];
  const lowRemaining =
    last && last.state !== 'pending' && typeof last.remaining === 'number' && last.remaining <= 3
      ? last.remaining
      : null;

  return (
    <section className="mt-8">
      <div className="bg-card rounded-2xl border border-card-border shadow-card p-5">
        <h2 className="font-display font-semibold text-[21px] text-mulberry">{copy.heading}</h2>
        <p className="text-[13.5px] text-muted-copy mt-0.5">{copy.blurb}</p>

        <div
          aria-live="polite"
          aria-busy={pending}
          className={messages.length ? 'mt-5 space-y-5' : ''}
        >
          {messages.map((m) => (
            <div key={m.id}>
              <p className="text-[15px] font-bold text-mulberry leading-[1.45]">{m.question}</p>

              {m.state === 'pending' && (
                <p className="flex items-center gap-2 text-[13.5px] text-muted-copy mt-1.5">
                  <Loader2 size={14} className="animate-spin" />
                  {copy.thinking}
                </p>
              )}

              {m.state === 'answer' && (
                <>
                  <p className="text-[15px] leading-[1.6] text-body-copy mt-1.5 whitespace-pre-wrap">
                    {m.answer}
                  </p>
                  {m.sources.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-raspberry mb-1.5">
                        From
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {m.sources.map((s, i) => (
                          <button
                            key={`${m.id}-${s.guide_id || i}`}
                            type="button"
                            onClick={openSource}
                            className="h-8 px-3.5 rounded-full bg-blush text-blush-copy font-bold text-[13.5px] max-w-full truncate"
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* A refusal is the honest answer, not a failure — same warmth as
                  the rest of the page, plus a pointer at the guides. */}
              {m.state === 'refusal' && (
                <div className="mt-1.5 bg-blush rounded-lg p-4">
                  <p className="text-[15px] leading-[1.6] text-blush-copy whitespace-pre-wrap">
                    {m.answer}
                  </p>
                  <p className="text-[13.5px] leading-[1.55] text-blush-copy mt-2">{copy.browse}</p>
                </div>
              )}

              {m.state === 'limit' && (
                <div className="mt-1.5 bg-blush rounded-lg p-4">
                  <p className="text-[15px] leading-[1.6] text-blush-copy">
                    You’ve asked a lot in the last hour — try again shortly.
                  </p>
                </div>
              )}

              {m.state === 'trouble' && (
                <p className="text-[15px] leading-[1.6] text-body-copy mt-1.5">
                  That didn’t go through. Give it another try in a moment.
                </p>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={ask} className="flex items-center gap-2.5 mt-5">
          <label htmlFor={inputId} className="sr-only">{copy.label}</label>
          <input
            id={inputId}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={copy.placeholder}
            disabled={pending}
            autoComplete="off"
            enterKeyHint="send"
            className="flex-1 min-w-0 h-12 px-4 rounded-full bg-cream border border-card-border text-[15px] text-mulberry placeholder:text-placeholder-copy focus:outline-none focus:border-hover-border disabled:opacity-60"
          />
          <button
            type="submit"
            aria-label="Send question"
            disabled={pending || !question.trim()}
            className="w-12 h-12 rounded-full bg-raspberry hover:bg-raspberry-hover text-cream flex items-center justify-center flex-shrink-0 disabled:opacity-50"
          >
            {pending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>

        {lowRemaining !== null && (
          <p className="text-[13.5px] text-muted-copy mt-2.5">
            {lowRemaining === 0 && 'That was the last question this hour.'}
            {lowRemaining === 1 && 'One more question this hour.'}
            {lowRemaining > 1 && `${lowRemaining} more questions this hour.`}
          </p>
        )}
      </div>
    </section>
  );
};

export default AskPlaybook;
