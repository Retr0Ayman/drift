import { lazy, Suspense, useState } from "react";
import { Routes, Route, Outlet } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import IntroAnimation from "./components/layout/IntroAnimation";
import CommandPalette from "./components/search/CommandPalette";
import RouteFallback from "./components/layout/RouteFallback";
import Home from "./components/home/Home";
import { useLiveCatalog } from "./hooks/useLiveCatalog";
import { useTheme } from "./hooks/useTheme";
import type { CatalogContextValue } from "./hooks/useCatalog";

// Home stays eager -- it's the landing page, almost always the first thing
// loaded anyway, so lazy-loading it would just add a network round trip
// with no benefit. Every other route is a deeper page most sessions never
// visit, and every build this project has run has warned about a single
// 500kB+ JS chunk -- splitting these out is a real, measurable first-load
// win with no behavior change.
const GameDetail = lazy(() => import("./components/game/GameDetail"));
const GroupsDirectory = lazy(() => import("./components/groups/GroupsDirectory"));
const GroupProfile = lazy(() => import("./components/groups/GroupProfile"));
const Leaderboard = lazy(() => import("./components/groups/Leaderboard"));
const PublishersDirectory = lazy(() => import("./components/publishers/PublishersDirectory"));
const PublisherProfile = lazy(() => import("./components/publishers/PublisherProfile"));
const FranchiseProfile = lazy(() => import("./components/publishers/FranchiseProfile"));
const Watchlist = lazy(() => import("./components/watchlist/Watchlist"));

function Layout() {
  const catalog = useLiveCatalog();
  const theme = useTheme();
  const [introDone, setIntroDone] = useState(false);
  // Lifted here, not local to CommandPalette, so both triggers -- Cmd/Ctrl+K
  // and clicking the navbar's SearchBar pill -- drive the same overlay
  // instead of two separate search UIs.
  const [searchOpen, setSearchOpen] = useState(false);
  const context: CatalogContextValue = {
    games: catalog.games,
    status: catalog.status,
    loading: catalog.loading,
    hasMore: catalog.hasMore,
    totalPages: catalog.totalPages,
    loadMore: catalog.loadMore,
    mergeOne: catalog.mergeOne,
    archiveMonth: catalog.archiveMonth,
    archiveDepthMonths: catalog.archiveDepthMonths,
  };

  return (
    <>
      <IntroAnimation onDone={() => setIntroDone(true)} />
      <Navbar
        status={catalog.status}
        onOpenSearch={() => setSearchOpen(true)}
        revealBrandO={introDone}
        theme={theme.resolved}
        onToggleTheme={theme.toggle}
      />
      <CommandPalette
        games={catalog.games}
        catalogStatus={catalog.status}
        onLiveGameResolved={catalog.mergeOne}
        open={searchOpen}
        onOpenChange={setSearchOpen}
      />
      <main className="page-content">
        <Suspense fallback={<RouteFallback />}>
          <Outlet context={context} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/game/:id" element={<GameDetail />} />
        <Route path="/groups" element={<GroupsDirectory />} />
        <Route path="/group/:key" element={<GroupProfile />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/publishers" element={<PublishersDirectory />} />
        <Route path="/publisher/:key" element={<PublisherProfile />} />
        <Route path="/franchise/:slug" element={<FranchiseProfile />} />
        <Route path="/watchlist" element={<Watchlist />} />
      </Route>
    </Routes>
  );
}
