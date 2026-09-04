-- In-app feedback: bubble submissions + the two one-time checkpoint prompts.
--
-- All writes go through the submit-feedback edge function (service role) so
-- fan-out (Sheet / Slack / email) always happens alongside the insert and the
-- client can never spoof another user's feedback. No client-facing policies.

CREATE TABLE IF NOT EXISTS public.feedback (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('bubble', 'setup', 'first_action')),
  rating     TEXT CHECK (rating IN ('up', 'down')),
  message    TEXT,
  context    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- route, platform, app version
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a submission must say something: a rating, a message, or both
  CONSTRAINT feedback_not_empty CHECK (rating IS NOT NULL OR message IS NOT NULL)
);

-- The two checkpoint prompts fire at most once per user, ever — enforced
-- here so a second device can't re-prompt and double-record.
CREATE UNIQUE INDEX IF NOT EXISTS feedback_checkpoint_once
  ON public.feedback (user_id, kind)
  WHERE kind <> 'bubble';

CREATE INDEX IF NOT EXISTS feedback_created_idx ON public.feedback (created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
-- Service-role only (edge function); no authenticated policies on purpose.
