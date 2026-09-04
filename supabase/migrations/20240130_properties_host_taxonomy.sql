-- Properties + the per-vertical content taxonomy.
--
-- Design: docs/platform/PROPERTIES.md (§1, §2). The taxonomy table is
-- CONTENT_ENGINE.md §3.2's design, shipped here because the guest-guide
-- builder is its first real consumer.

-- ---------------------------------------------------------------------------
-- 1. content_categories — category becomes per-vertical taxonomy DATA
-- ---------------------------------------------------------------------------
-- Same pattern and posture as the RBAC tables (RBAC.md §2): a new vertical is
-- an INSERT; read-only to authenticated; NO write policy, because seeding is
-- migration/service_role-only. No FK or CHECK is added to guides.category —
-- CONTENT_ENGINE.md §3.5 defers constraining until live values are enumerated.

CREATE TABLE IF NOT EXISTS public.content_categories (
  workspace_type text    NOT NULL,
  key            text    NOT NULL,   -- the literal value stored in guides.category
  label          text    NOT NULL,
  prompt_hint    text,               -- one clause for AI system prompts
  color_token    text,               -- 'raspberry' | 'apricot' | 'mulberry' | 'coral'
  sort_order     integer NOT NULL,
  is_default     boolean NOT NULL DEFAULT false,
  PRIMARY KEY (workspace_type, key)
);

ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_categories_read ON public.content_categories;
CREATE POLICY content_categories_read
  ON public.content_categories
  FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.content_categories
  (workspace_type, key, label, prompt_hint, color_token, sort_order, is_default)
VALUES
  -- Family: codifies exactly what the app renders today, including Emergency,
  -- which GuideIcon already styles but the picker never offered.
  ('family', 'How To',    'How To',    'step-by-step instructions for doing something',            'raspberry', 1, true),
  ('family', 'Find It',   'Find It',   'where something is kept or located',                       'apricot',   2, false),
  ('family', 'Reference', 'Reference', 'facts, contacts, schedules or lists',                      'mulberry',  3, false),
  ('family', 'Emergency', 'Emergency', 'what to do in an emergency; leads guest-facing lists',     'coral',     4, false),
  -- Host: Arrival / House / Local / Departure (CONTENT_ENGINE.md §3.2).
  ('host', 'Arrival',   'Arrival',   'check-in, keys, codes, parking, getting in',                 'raspberry', 1, true),
  ('host', 'House',     'House',     'appliances, wifi, house rules, how things work here',        'apricot',   2, false),
  ('host', 'Local',     'Local',     'recommendations nearby: food, sights, essentials',           'mulberry',  3, false),
  ('host', 'Departure', 'Departure', 'check-out steps, keys back, trash, leaving',                 'coral',     4, false)
ON CONFLICT (workspace_type, key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. properties — a row plus a convention
-- ---------------------------------------------------------------------------
-- The per-property playbook is NOT a new content type: it is the property's
-- one bundle on the existing content engine. bundle_id UNIQUE enforces the
-- one-bundle-per-property convention in the schema, not in prose.
--
-- ON DELETE RESTRICT on bundle_id: content outlives the veneer. Deleting a
-- bundle that is some property's playbook is refused until the property row
-- goes first; deleting a property leaves its bundle (and guides) intact.
--
-- workspace_id is born nullable-and-present (PROPERTIES.md §1) so
-- ARCHITECTURE.md migration #4 has one less table to retrofit.

CREATE TABLE IF NOT EXISTS public.properties (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,
  bundle_id    uuid NOT NULL UNIQUE REFERENCES public.packs(id) ON DELETE RESTRICT,
  name         text NOT NULL,
  address      text,
  -- Public URL, uploaded through the existing ImageUpload path. This is the
  -- SAME recorded media debt as every other image (CONTENT_ENGINE.md §5),
  -- not new debt: the remediation there covers this column too.
  photo_url    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS properties_user_idx ON public.properties (user_id);

ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Owner-only CRUD — the exact posture packs has today. Guests never touch
-- this table; the guest surface is the share link + get_shared_content /
-- ask-playbook. Workspace-scoped policies replace these in Prompt 3's
-- capability migration, same as every other content table.
DROP POLICY IF EXISTS properties_owner_select ON public.properties;
CREATE POLICY properties_owner_select ON public.properties
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS properties_owner_insert ON public.properties;
CREATE POLICY properties_owner_insert ON public.properties
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS properties_owner_update ON public.properties;
CREATE POLICY properties_owner_update ON public.properties
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS properties_owner_delete ON public.properties;
CREATE POLICY properties_owner_delete ON public.properties
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER properties_bump_updated_at
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION bump_updated_at();
