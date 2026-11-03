-- ARTiFACT is a hypervisor group (DenuvOwO, the previous HV group, is
-- semi-retired). worker/shared/constants.ts's GROUP_METHOD now says so, and
-- the catalog route derives method from the group at read time, so the UI is
-- already right -- but releases written BEFORE the group was classified are
-- stored as "trad" (UPSERT_RELEASE_SQL never rewrites method unless a row's
-- ts advances), and worker/backfill/crackEta.ts filters on the STORED column
-- in SQL (r.method = 'trad'), so those rows would keep being counted as
-- traditional cracks in the Crack ETA stats. Idempotent.
UPDATE releases SET method = 'hv' WHERE lower(group_name) = 'artifact' AND method != 'hv';
