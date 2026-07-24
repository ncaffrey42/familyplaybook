-- Family Playbook: public schema snapshot (generated from the live database)
-- Source of truth for a NEW environment: apply this file first, then mark
-- all migrations up to and including 20240112 as applied
-- (supabase migration repair --status applied <versions>).
-- Regenerate with scripts/generate-schema-snapshot (see repo docs).

CREATE TABLE IF NOT EXISTS public.ai_generations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT ai_generations_pkey PRIMARY KEY (id),
  CONSTRAINT ai_generations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.error_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  message text NOT NULL,
  stack text,
  component_stack text,
  url text,
  breadcrumbs jsonb,
  ai_analysis text,
  user_id uuid,
  CONSTRAINT error_logs_pkey PRIMARY KEY (id),
  CONSTRAINT error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.family_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  owner_user_id uuid NOT NULL,
  invited_email text NOT NULL,
  invited_user_id uuid,
  role text DEFAULT 'editor'::text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  accepted_at timestamp with time zone,
  invited_name text,
  CONSTRAINT family_invitations_owner_user_id_invited_email_key UNIQUE (owner_user_id, invited_email),
  CONSTRAINT family_invitations_token_key UNIQUE (token),
  CONSTRAINT family_invitations_pkey PRIMARY KEY (id),
  CONSTRAINT family_invitations_invited_user_id_fkey FOREIGN KEY (invited_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT family_invitations_owner_user_id_fkey FOREIGN KEY (owner_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT family_invitations_role_check CHECK ((role = ANY (ARRAY['viewer'::text, 'editor'::text]))),
  CONSTRAINT family_invitations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'removed'::text])))
);
ALTER TABLE public.family_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.family_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  inviter_id uuid NOT NULL,
  invitee_email text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT family_members_inviter_id_invitee_email_key UNIQUE (inviter_id, invitee_email),
  CONSTRAINT family_members_pkey PRIMARY KEY (id),
  CONSTRAINT family_members_inviter_id_fkey FOREIGN KEY (inviter_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.guides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  name text NOT NULL,
  icon text,
  category text,
  steps jsonb,
  content jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  is_shareable boolean DEFAULT true,
  is_archived boolean DEFAULT false,
  archived_at timestamp with time zone,
  description text,
  template_id uuid,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT guides_pkey PRIMARY KEY (id),
  CONSTRAINT guides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.library_guides (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  library_pack_id text NOT NULL,
  name text NOT NULL,
  icon text,
  category text,
  steps jsonb,
  content jsonb,
  created_at timestamp with time zone DEFAULT now(),
  description text,
  CONSTRAINT library_guides_library_pack_id_name_key UNIQUE (library_pack_id, name),
  CONSTRAINT library_guides_pkey PRIMARY KEY (id),
  CONSTRAINT library_guides_library_pack_id_fkey FOREIGN KEY (library_pack_id) REFERENCES library_packs(id) ON DELETE CASCADE
);
ALTER TABLE public.library_guides ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.library_packs (
  id text NOT NULL,
  name text NOT NULL,
  description text,
  color text,
  created_at timestamp with time zone DEFAULT now(),
  image text,
  CONSTRAINT library_packs_pkey PRIMARY KEY (id)
);
ALTER TABLE public.library_packs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pack_guides (
  pack_id uuid NOT NULL,
  guide_id uuid NOT NULL,
  position integer,
  CONSTRAINT pack_guides_pkey PRIMARY KEY (pack_id, guide_id),
  CONSTRAINT pack_guides_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  CONSTRAINT pack_guides_pack_id_fkey FOREIGN KEY (pack_id) REFERENCES packs(id) ON DELETE CASCADE
);
ALTER TABLE public.pack_guides ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.packs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  name text NOT NULL,
  description text,
  color text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  template_id text,
  archived_at timestamp with time zone,
  is_archived boolean DEFAULT false,
  image text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT packs_pkey PRIMARY KEY (id),
  CONSTRAINT packs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.packs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plan_id uuid,
  feature_key text NOT NULL,
  feature_value_text text,
  feature_value_int bigint,
  is_unlimited boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT plan_entitlements_plan_id_feature_key_key UNIQUE (plan_id, feature_key),
  CONSTRAINT plan_entitlements_pkey PRIMARY KEY (id),
  CONSTRAINT plan_entitlements_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  plan_key text,
  CONSTRAINT plans_name_key UNIQUE (name),
  CONSTRAINT plans_pkey PRIMARY KEY (id)
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  stripe_customer_id text,
  subscription_status text,
  price_id text,
  subscription_id text,
  current_period_end timestamp with time zone,
  full_name text,
  avatar_url text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid DEFAULT auth.uid() NOT NULL,
  subscription_details jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  endpoint text DEFAULT (subscription_details ->> 'endpoint'::text),
  CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.revenuecat_webhook_events (
  id text NOT NULL,
  type text,
  app_user_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT revenuecat_webhook_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.revenuecat_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shared_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  guide_id uuid,
  bundle_id uuid,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT shared_links_pkey PRIMARY KEY (id),
  CONSTRAINT shared_links_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES packs(id) ON DELETE CASCADE,
  CONSTRAINT shared_links_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  CONSTRAINT shared_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stripe_price_map (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  plan_key text NOT NULL,
  billing_interval text NOT NULL,
  stripe_product_id text NOT NULL,
  stripe_price_id text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT stripe_price_map_plan_key_billing_interval_key UNIQUE (plan_key, billing_interval),
  CONSTRAINT stripe_price_map_pkey PRIMARY KEY (id)
);
ALTER TABLE public.stripe_price_map ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text NOT NULL,
  type text NOT NULL,
  created timestamp with time zone NOT NULL,
  processed_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT stripe_webhook_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_billing (
  user_id uuid NOT NULL,
  stripe_customer_id text,
  plan_key text DEFAULT 'free'::text,
  billing_interval text,
  subscription_status text DEFAULT 'free'::text,
  price_id text,
  current_period_end timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  cancel_at_period_end boolean DEFAULT false,
  stripe_subscription_id text,
  last_event_at timestamp with time zone,
  scheduled_plan_key text,
  scheduled_change_at timestamp with time zone,
  billing_provider text DEFAULT 'stripe'::text NOT NULL,
  CONSTRAINT user_billing_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_billing_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.user_billing ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_favorites (
  user_id uuid NOT NULL,
  guide_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  CONSTRAINT user_favorites_pkey PRIMARY KEY (user_id, guide_id),
  CONSTRAINT user_favorites_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES guides(id) ON DELETE CASCADE,
  CONSTRAINT user_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_secrets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  name text NOT NULL,
  secret text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_secrets_user_id_name_key UNIQUE (user_id, name),
  CONSTRAINT user_secrets_pkey PRIMARY KEY (id),
  CONSTRAINT user_secrets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.user_secrets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  plan_id uuid,
  status text DEFAULT 'active'::text,
  current_period_start timestamp with time zone DEFAULT now(),
  current_period_end timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_subscriptions_user_id_key UNIQUE (user_id),
  CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id),
  CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_usage (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  feature_key text NOT NULL,
  current_usage bigint DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_usage_user_id_feature_key_key UNIQUE (user_id, feature_key),
  CONSTRAINT user_usage_pkey PRIMARY KEY (id),
  CONSTRAINT user_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.user_usage ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  user_id uuid,
  processed_at timestamp with time zone DEFAULT now(),
  payload jsonb,
  CONSTRAINT webhook_events_event_id_key UNIQUE (event_id),
  CONSTRAINT webhook_events_pkey PRIMARY KEY (id)
);
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ai_generations_user_created_idx ON public.ai_generations USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS guides_user_updated_idx ON public.guides USING btree (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guides_is_archived ON public.guides USING btree (is_archived);
CREATE INDEX IF NOT EXISTS idx_guides_name_gin ON public.guides USING gin (to_tsvector('english'::regconfig, name));
CREATE INDEX IF NOT EXISTS idx_guides_user_id ON public.guides USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_library_guides_library_pack_id ON public.library_guides USING btree (library_pack_id);
CREATE INDEX IF NOT EXISTS idx_pack_guides_guide_id ON public.pack_guides USING btree (guide_id);
CREATE INDEX IF NOT EXISTS idx_pack_guides_pack_id ON public.pack_guides USING btree (pack_id);
CREATE INDEX IF NOT EXISTS pack_guides_pack_position_idx ON public.pack_guides USING btree (pack_id, "position");
CREATE INDEX IF NOT EXISTS idx_packs_is_archived ON public.packs USING btree (is_archived);
CREATE INDEX IF NOT EXISTS idx_packs_user_id ON public.packs USING btree (user_id);
CREATE INDEX IF NOT EXISTS packs_user_updated_idx ON public.packs USING btree (user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS plans_plan_key_idx ON public.plans USING btree (plan_key);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user_guide ON public.user_favorites USING btree (user_id, guide_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON public.webhook_events USING btree (event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user_id ON public.webhook_events USING btree (user_id);

-- ── Functions ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_user_data()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_user_id uuid := auth.uid();
    packs_data json;
    guides_data json;
    favorites_data json;
    pack_guides_data json;
    result_data json;
BEGIN
    SELECT json_agg(p) INTO packs_data
    FROM (
        SELECT id, name, description, image, color, template_id, is_archived, archived_at
        FROM public.packs
        WHERE user_id = current_user_id
    ) p;

    SELECT json_agg(g) INTO guides_data
    FROM (
        SELECT id, name, icon, category, steps, content, is_shareable, is_archived, archived_at
        FROM public.guides
        WHERE user_id = current_user_id
    ) g;

    SELECT json_agg(f) INTO favorites_data
    FROM (
        SELECT guide_id
        FROM public.user_favorites
        WHERE user_id = current_user_id
    ) f;

    SELECT json_agg(pg) INTO pack_guides_data
    FROM public.pack_guides pg
    WHERE pg.pack_id IN (SELECT id FROM public.packs WHERE user_id = current_user_id);

    SELECT json_build_object(
        'packs', COALESCE(packs_data, '[]'::json),
        'guides', COALESCE(guides_data, '[]'::json),
        'pack_guides', COALESCE(pack_guides_data, '[]'::json),
        'user_favorites', COALESCE(favorites_data, '[]'::json)
    ) INTO result_data;

    RETURN result_data;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_openai_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
  secret_val text;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT secret INTO secret_val
  FROM public.user_secrets
  WHERE user_id = uid AND name = 'openai_key';
  
  RETURN secret_val;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pack_guide_counts(user_uuid uuid)
 RETURNS TABLE(pack_id uuid, guide_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
        SELECT p.id as pack_id, count(pg.guide_id) as guide_count
        FROM packs p
        LEFT JOIN pack_guides pg ON p.id = pg.pack_id
        LEFT JOIN guides g ON pg.guide_id = g.id
        WHERE p.user_id = user_uuid
          AND (g.is_archived IS NULL OR g.is_archived = false)
        GROUP BY p.id;
    $function$;

CREATE OR REPLACE FUNCTION public.get_shared_content(p_share_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link          RECORD;
  v_guide         RECORD;
  v_bundle        RECORD;
  v_bundle_guides JSONB;
BEGIN
  IF p_share_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, guide_id, bundle_id INTO v_link
    FROM shared_links
   WHERE id = p_share_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_link.guide_id IS NOT NULL THEN
    SELECT id, name, description, icon, steps, category, is_shareable
      INTO v_guide
      FROM guides
     WHERE id = v_link.guide_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- The link survives un-sharing, but the content does not.
    IF NOT COALESCE(v_guide.is_shareable, FALSE) THEN
      RETURN jsonb_build_object('type', 'private');
    END IF;

    -- Bundle context for the header: the link's own bundle, else the first
    -- bundle this guide belongs to.
    SELECT p.id, p.name, p.description, p.color, p.image
      INTO v_bundle
      FROM packs p
     WHERE p.id = COALESCE(
             v_link.bundle_id,
             (SELECT pack_id FROM pack_guides WHERE guide_id = v_link.guide_id LIMIT 1)
           );

    RETURN jsonb_build_object(
      'type',   'guide',
      'guide',  jsonb_build_object(
                  'id', v_guide.id, 'name', v_guide.name,
                  'description', v_guide.description, 'icon', v_guide.icon,
                  'steps', v_guide.steps, 'category', v_guide.category
                ),
      'bundle', CASE WHEN v_bundle.id IS NULL THEN NULL ELSE
                  jsonb_build_object(
                    'id', v_bundle.id, 'name', v_bundle.name,
                    'description', v_bundle.description,
                    'color', v_bundle.color, 'image', v_bundle.image
                  )
                END
    );
  END IF;

  IF v_link.bundle_id IS NOT NULL THEN
    SELECT id, name, description, color, image INTO v_bundle
      FROM packs
     WHERE id = v_link.bundle_id;
    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    -- Only shareable guides that have their own share link are listed —
    -- same filter the client used to apply.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', g.id, 'name', g.name, 'description', g.description,
             'icon', g.icon, 'category', g.category, 'shareId', sl.id
           )), '[]'::jsonb)
      INTO v_bundle_guides
      FROM pack_guides pg
      JOIN guides g
        ON g.id = pg.guide_id
       AND COALESCE(g.is_shareable, FALSE)
      JOIN LATERAL (
        SELECT id FROM shared_links sl2 WHERE sl2.guide_id = g.id LIMIT 1
      ) sl ON TRUE
     WHERE pg.pack_id = v_link.bundle_id;

    RETURN jsonb_build_object(
      'type',          'bundle',
      'bundle',        jsonb_build_object(
                         'id', v_bundle.id, 'name', v_bundle.name,
                         'description', v_bundle.description,
                         'color', v_bundle.color, 'image', v_bundle.image
                       ),
      'bundle_guides', v_bundle_guides
    );
  END IF;

  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_numeric_limit(p_user_id uuid, p_feature_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_key     TEXT;
  v_plan_id      UUID;
  v_value        INTEGER;
  v_is_unlimited BOOLEAN;
BEGIN
  IF p_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(plan_key, 'free') INTO v_plan_key
    FROM public.user_billing WHERE user_id = p_user_id LIMIT 1;
  IF v_plan_key IS NULL THEN v_plan_key := 'free'; END IF;

  SELECT id INTO v_plan_id
    FROM public.plans WHERE plan_key = v_plan_key LIMIT 1;
  IF v_plan_id IS NULL THEN RETURN NULL; END IF;  -- fail open

  SELECT feature_value_int, COALESCE(is_unlimited, false)
    INTO v_value, v_is_unlimited
    FROM public.plan_entitlements
   WHERE plan_id = v_plan_id AND feature_key = p_feature_key LIMIT 1;

  IF v_is_unlimited THEN RETURN NULL; END IF;
  RETURN v_value;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_subscription_usage()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_usage (user_id, feature_key, current_usage)
  VALUES 
    (NEW.user_id, 'active_guides', 0),
    (NEW.user_id, 'bundles', 0),
    (NEW.user_id, 'archived_guides', 0),
    (NEW.user_id, 'storage_bytes', 0),
    (NEW.user_id, 'editors', 0)
  ON CONFLICT (user_id, feature_key) DO NOTHING;
  
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Maintain existing profiles logic
  INSERT INTO public.profiles (id, full_name, avatar_url, subscription_status)
  VALUES (
    new.id, 
    new.raw_user_meta_data->>'name', 
    new.raw_user_meta_data->>'avatar_url',
    COALESCE(new.raw_user_meta_data->>'subscription_status', 'free')
  ) ON CONFLICT (id) DO NOTHING;

  -- Add new user_billing logic
  INSERT INTO public.user_billing (user_id, plan_key, subscription_status)
  VALUES (
    new.id,
    'free',
    'free'
  ) ON CONFLICT (user_id) DO NOTHING;
  
  RETURN new;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  free_plan_id uuid;
BEGIN
  SELECT id INTO free_plan_id FROM public.plans WHERE name = 'Free' LIMIT 1;
  
  IF free_plan_id IS NOT NULL THEN
    INSERT INTO public.user_subscriptions (user_id, plan_id, status)
    VALUES (NEW.id, free_plan_id, 'active')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.has_openai_key()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN 
    RETURN false;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_secrets 
    WHERE user_id = uid AND name = 'openai_key'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_usage(target_user_id uuid, key_name text, delta bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.user_usage (user_id, feature_key, current_usage, updated_at)
  VALUES (target_user_id, key_name, delta, now())
  ON CONFLICT (user_id, feature_key)
  DO UPDATE SET 
    current_usage = user_usage.current_usage + delta,
    updated_at = now();
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_accepted_family_member(p_owner_id uuid, p_required_role text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM family_invitations
     WHERE owner_user_id   = p_owner_id
       AND invited_user_id = auth.uid()
       AND status          = 'accepted'
       AND (p_required_role IS NULL OR role = p_required_role)
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_guide_editable(p_guide_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  UUID;
  v_limit    INTEGER;
  v_rank     INTEGER;
BEGIN
  IF p_guide_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.guides
   WHERE id = p_guide_id;

  IF v_user_id IS NULL THEN
    RETURN TRUE;
  END IF;

  v_limit := public.get_user_numeric_limit(v_user_id, 'active_guides_max');

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT rnk INTO v_rank
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY updated_at DESC NULLS LAST, id DESC
             ) AS rnk
        FROM public.guides
       WHERE user_id = v_user_id
    ) ranked
   WHERE id = p_guide_id;

  RETURN COALESCE(v_rank, 0) <= v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_pack_editable(p_pack_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id  UUID;
  v_limit    INTEGER;
  v_rank     INTEGER;
BEGIN
  IF p_pack_id IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT user_id INTO v_user_id
    FROM public.packs
   WHERE id = p_pack_id;

  IF v_user_id IS NULL THEN
    RETURN TRUE;
  END IF;

  v_limit := public.get_user_numeric_limit(v_user_id, 'bundles_max');

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT rnk INTO v_rank
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (
               ORDER BY updated_at DESC NULLS LAST, id DESC
             ) AS rnk
        FROM public.packs
       WHERE user_id = v_user_id
    ) ranked
   WHERE id = p_pack_id;

  RETURN COALESCE(v_rank, 0) <= v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_premium(user_uuid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.user_billing
    WHERE user_id = user_uuid
      AND subscription_status IN ('active', 'trialing')
      AND current_period_end > NOW()
      AND plan_key IN ('couple', 'family')
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_stripe_updates()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- If the user is a standard authenticated user (not service_role)
  -- and they try to change restricted fields, block it.
  IF (auth.role() = 'authenticated') AND (
    NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id OR
    NEW.subscription_status IS DISTINCT FROM OLD.subscription_status OR
    NEW.price_id IS DISTINCT FROM OLD.price_id OR
    NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
  ) THEN
    RAISE EXCEPTION 'You are not allowed to update protected subscription fields directly.';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_usage_stats(target_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  active_count bigint;
  archived_count bigint;
  bundles_count bigint;
  editors_count bigint;
  storage_size bigint;
  result json;
BEGIN
  -- Count active guides
  SELECT count(*) INTO active_count
  FROM public.guides
  WHERE user_id = target_user_id AND (is_archived = false OR is_archived IS NULL);

  -- Count archived guides
  SELECT count(*) INTO archived_count
  FROM public.guides
  WHERE user_id = target_user_id AND is_archived = true;

  -- Count bundles/packs
  SELECT count(*) INTO bundles_count
  FROM public.packs
  WHERE user_id = target_user_id;

  -- Count editors (accepted family members)
  -- Assuming status='accepted' and checking role logic if column exists, 
  -- otherwise just count accepted members as per Family plan usually implies seats.
  -- Adjust filter based on exact schema of family_members.
  SELECT count(*) INTO editors_count
  FROM public.family_members
  WHERE inviter_id = target_user_id AND status = 'accepted';

  -- Sum storage from storage.objects
  -- Note: This requires access to storage schema. Security definer allows this.
  SELECT COALESCE(SUM((metadata->>'size')::bigint), 0) INTO storage_size
  FROM storage.objects
  WHERE owner_id = target_user_id::text;

  -- Update user_usage table
  INSERT INTO public.user_usage (user_id, feature_key, current_usage, updated_at)
  VALUES 
    (target_user_id, 'active_guides', active_count, now()),
    (target_user_id, 'archived_guides', archived_count, now()),
    (target_user_id, 'bundles', bundles_count, now()),
    (target_user_id, 'editors', editors_count, now()),
    (target_user_id, 'storage_bytes', storage_size, now())
  ON CONFLICT (user_id, feature_key) 
  DO UPDATE SET current_usage = EXCLUDED.current_usage, updated_at = now();

  SELECT json_build_object(
    'active_guides', active_count,
    'archived_guides', archived_count,
    'bundles', bundles_count,
    'editors', editors_count,
    'storage_bytes', storage_size
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_user_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    current_user_id uuid := auth.uid();
BEGIN
    -- Delete associations first to avoid foreign key violations
    DELETE FROM public.pack_guides WHERE guide_id IN (SELECT id FROM public.guides WHERE user_id = current_user_id);
    DELETE FROM public.pack_guides WHERE pack_id IN (SELECT id FROM public.packs WHERE user_id = current_user_id);

    DELETE FROM public.user_favorites WHERE user_id = current_user_id;

    -- Delete main entities
    DELETE FROM public.guides WHERE user_id = current_user_id;
    DELETE FROM public.packs WHERE user_id = current_user_id;
    
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_openai_key(api_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  INSERT INTO public.user_secrets (user_id, name, secret)
  VALUES (uid, 'openai_key', api_key)
  ON CONFLICT (user_id, name)
  DO UPDATE SET 
    secret = EXCLUDED.secret, 
    updated_at = NOW();
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_billing_modtime()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_secret(secret_name text, secret_value text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'vault', 'public', 'extensions'
AS $function$
BEGIN
    INSERT INTO vault.secrets (name, secret, description)
    VALUES (secret_name, secret_value, 'Secret managed by Horizons AI')
    ON CONFLICT (name)
    DO UPDATE SET 
        secret = EXCLUDED.secret, 
        updated_at = NOW();
END;
$function$;

-- ── Triggers ─────────────────────────────────────────────────
CREATE TRIGGER guides_bump_updated_at BEFORE UPDATE ON public.guides FOR EACH ROW EXECUTE FUNCTION bump_updated_at();
CREATE TRIGGER packs_bump_updated_at BEFORE UPDATE ON public.packs FOR EACH ROW EXECUTE FUNCTION bump_updated_at();
CREATE TRIGGER check_billing_updates BEFORE UPDATE ON public.user_billing FOR EACH ROW EXECUTE FUNCTION prevent_stripe_updates();
CREATE TRIGGER update_user_billing_modtime BEFORE UPDATE ON public.user_billing FOR EACH ROW EXECUTE FUNCTION update_user_billing_modtime();
CREATE TRIGGER on_subscription_created_usage AFTER INSERT ON public.user_subscriptions FOR EACH ROW EXECUTE FUNCTION handle_new_subscription_usage();

-- ── RLS policies ─────────────────────────────────────────────
CREATE POLICY "ai_generations_owner_select" ON public.ai_generations FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own error logs" ON public.error_logs FOR DELETE USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own error logs" ON public.error_logs FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can view their own error logs" ON public.error_logs FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "member_select" ON public.family_invitations FOR SELECT USING ((auth.uid() = invited_user_id));
CREATE POLICY "owner_select" ON public.family_invitations FOR SELECT USING ((auth.uid() = owner_user_id));
CREATE POLICY "Users can manage their own family members" ON public.family_members FOR ALL USING ((auth.uid() = inviter_id));
CREATE POLICY "Users can delete their own guides." ON public.guides FOR DELETE USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own guides." ON public.guides FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own guides." ON public.guides FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "guides_block_readonly_update" ON public.guides AS RESTRICTIVE FOR UPDATE USING (is_guide_editable(id)) WITH CHECK (is_guide_editable(id));
CREATE POLICY "guides_editor_update" ON public.guides FOR UPDATE TO authenticated USING (is_accepted_family_member(user_id, 'editor'::text)) WITH CHECK (is_accepted_family_member(user_id, 'editor'::text));
CREATE POLICY "guides_member_select" ON public.guides FOR SELECT TO authenticated USING (is_accepted_family_member(user_id));
CREATE POLICY "guides_owner_delete" ON public.guides FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "guides_owner_select" ON public.guides FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Allow public read access to library guides" ON public.library_guides FOR SELECT USING (true);
CREATE POLICY "Allow public read access to library packs" ON public.library_packs FOR SELECT USING (true);
CREATE POLICY "Allow owners to manage pack_guides" ON public.pack_guides FOR ALL USING (((EXISTS ( SELECT 1
   FROM packs
  WHERE ((packs.id = pack_guides.pack_id) AND (packs.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM guides
  WHERE ((guides.id = pack_guides.guide_id) AND (guides.user_id = auth.uid())))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM packs
  WHERE ((packs.id = pack_guides.pack_id) AND (packs.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM guides
  WHERE ((guides.id = pack_guides.guide_id) AND (guides.user_id = auth.uid()))))));
CREATE POLICY "pack_guides_block_readonly_insert" ON public.pack_guides AS RESTRICTIVE FOR INSERT WITH CHECK (is_pack_editable(pack_id));
CREATE POLICY "pack_guides_member_select" ON public.pack_guides FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM packs p
  WHERE ((p.id = pack_guides.pack_id) AND is_accepted_family_member(p.user_id)))) OR (EXISTS ( SELECT 1
   FROM guides g
  WHERE ((g.id = pack_guides.guide_id) AND is_accepted_family_member(g.user_id))))));
CREATE POLICY "pack_guides_owner_delete" ON public.pack_guides FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM packs p
  WHERE ((p.id = pack_guides.pack_id) AND (p.user_id = auth.uid())))));
CREATE POLICY "pack_guides_owner_select" ON public.pack_guides FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM packs p
  WHERE ((p.id = pack_guides.pack_id) AND (p.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM guides g
  WHERE ((g.id = pack_guides.guide_id) AND (g.user_id = auth.uid()))))));
CREATE POLICY "Users can archive/unarchive their own packs" ON public.packs FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can delete their own packs." ON public.packs FOR DELETE USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert their own packs." ON public.packs FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can update their own packs." ON public.packs FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "Users can view their own archived packs" ON public.packs FOR SELECT USING (((auth.uid() = user_id) AND (is_archived = true)));
CREATE POLICY "packs_block_readonly_update" ON public.packs AS RESTRICTIVE FOR UPDATE USING (is_pack_editable(id)) WITH CHECK (is_pack_editable(id));
CREATE POLICY "packs_editor_update" ON public.packs FOR UPDATE TO authenticated USING (is_accepted_family_member(user_id, 'editor'::text)) WITH CHECK (is_accepted_family_member(user_id, 'editor'::text));
CREATE POLICY "packs_member_select" ON public.packs FOR SELECT TO authenticated USING (is_accepted_family_member(user_id));
CREATE POLICY "packs_owner_delete" ON public.packs FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "packs_owner_select" ON public.packs FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Public read access to entitlements" ON public.plan_entitlements FOR SELECT USING (true);
CREATE POLICY "Public read access to plans" ON public.plans FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));
CREATE POLICY "Users can manage their own push subscriptions" ON public.push_subscriptions FOR ALL USING ((auth.uid() = user_id));
CREATE POLICY "revenuecat_events_service" ON public.revenuecat_webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users can create their own shared links" ON public.shared_links FOR INSERT WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "shared_links_owner_delete" ON public.shared_links FOR DELETE TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "shared_links_owner_select" ON public.shared_links FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "Allow public read access to active prices" ON public.stripe_price_map FOR SELECT USING ((active = true));
CREATE POLICY "Users can update own billing" ON public.user_billing FOR UPDATE USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own billing" ON public.user_billing FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "Users can manage their own favorites." ON public.user_favorites FOR ALL USING ((auth.uid() = user_id));
CREATE POLICY "Users can manage their own secrets" ON public.user_secrets FOR ALL USING ((auth.uid() = user_id));
CREATE POLICY "Users view own subscription" ON public.user_subscriptions FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "Users view own usage" ON public.user_usage FOR SELECT USING ((auth.uid() = user_id));
CREATE POLICY "Service role can manage webhook events" ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

