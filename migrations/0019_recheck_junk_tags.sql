-- Rows still carrying storefront shorthands / markup debris written by the
-- first DRM-tag pass (and not fully reparsed): re-queue them so the recheck's
-- tag normalisation cleans them. NULL drm_checked_at sorts first.
UPDATE games SET drm_checked_at = NULL
WHERE denuvo_watch = 1
  AND (tags LIKE '%"Origin"%' OR tags LIKE '%"MacApp"%' OR tags LIKE '%"EGS"%' OR tags LIKE '%"GOG"%'
       OR tags LIKE '%"disc"%' OR tags LIKE '%"Disc"%' OR tags LIKE '%"Online"%' OR tags LIKE '%"Unknown"%'
       OR tags LIKE '%"Uplay"%' OR tags LIKE '%"uplay"%' OR tags LIKE '%"uPlay"%' OR tags LIKE '%"Enigma"%'
       OR tags LIKE '%=%' OR tags LIKE '%"8.13.0066"%');
