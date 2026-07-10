-- Ordered guides within a bundle.
--
-- pack_guides had no ordering, so bundle contents rendered in whatever order
-- the client happened to load them. The AI Handoff feature curates guides by
-- priority (emergency/medical first), and that order only matters if it can be
-- persisted. This adds an optional position; NULL sorts last so existing rows
-- are unaffected until something sets a position.

ALTER TABLE public.pack_guides
  ADD COLUMN IF NOT EXISTS position INTEGER;

CREATE INDEX IF NOT EXISTS pack_guides_pack_position_idx
  ON public.pack_guides (pack_id, position);
