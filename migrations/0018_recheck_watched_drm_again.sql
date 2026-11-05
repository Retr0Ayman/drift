-- One more pass over the watched rows after tag normalisation fixes
-- (EGS/MacApp/GOG/Disc shorthands, Uplay->Ubisoft Connect, Origin->EA app,
-- markup debris) so the junk names written by the first pass are replaced.
UPDATE games SET drm_checked_at = NULL WHERE denuvo_watch = 1;
