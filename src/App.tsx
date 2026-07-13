import { Routes, Route, Outlet } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Home from "./components/home/Home";
import GameDetail from "./components/game/GameDetail";
import GroupsDirectory from "./components/groups/GroupsDirectory";
import GroupProfile from "./components/groups/GroupProfile";
import PublishersDirectory from "./components/publishers/PublishersDirectory";
import PublisherProfile from "./components/publishers/PublisherProfile";
import { useLiveCatalog } from "./hooks/useLiveCatalog";
import type { CatalogContextValue } from "./hooks/useCatalog";

function Layout() {
  const catalog = useLiveCatalog();
  const context: CatalogContextValue = {
    games: catalog.games,
    status: catalog.status,
    loading: catalog.loading,
    hasMore: catalog.hasMore,
    loadMore: catalog.loadMore,
    mergeOne: catalog.mergeOne,
  };

  return (
    <>
      <Navbar games={catalog.games} status={catalog.status} onLiveGameResolved={catalog.mergeOne} />
      <Outlet context={context} />
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
        <Route path="/publishers" element={<PublishersDirectory />} />
        <Route path="/publisher/:key" element={<PublisherProfile />} />
      </Route>
    </Routes>
  );
}
