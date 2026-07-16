-- Games' card/cover images were guessed client-side as
-- cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg -- Steam has
-- since moved many titles' header image to a per-app hashed path under
-- shared.akamai.steamstatic.com/store_item_assets/..., so that guess 404s
-- for most recently-added games (confirmed live). Steam's own appdetails
-- response already carries the real, correct URL (worker/routes/
-- appdetails.ts's `header` field) -- this just gives it somewhere to land.

ALTER TABLE games ADD COLUMN header TEXT;
