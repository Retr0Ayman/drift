import { Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Hero from "./components/home/Hero";
import GameGrid from "./components/home/GameGrid";
import GameDetail from "./components/game/GameDetail";
import GroupsDirectory from "./components/groups/GroupsDirectory";
import GroupProfile from "./components/groups/GroupProfile";
import { SEED_GAMES } from "./data/seedGames";

function Home() {
  return (
    <>
      <Hero />
      <GameGrid games={SEED_GAMES} />
    </>
  );
}

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/game/:id" element={<GameDetail />} />
        <Route path="/groups" element={<GroupsDirectory />} />
        <Route path="/group/:key" element={<GroupProfile />} />
      </Routes>
      <Footer />
    </>
  );
}
