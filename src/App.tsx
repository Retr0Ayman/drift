import { Routes, Route } from "react-router-dom";
import Navbar from "./components/layout/Navbar";
import Footer from "./components/layout/Footer";
import Hero from "./components/home/Hero";
import GameGrid from "./components/home/GameGrid";
import { SEED_GAMES } from "./data/seedGames";

function Home() {
  return (
    <>
      <Hero />
      <GameGrid games={SEED_GAMES} />
    </>
  );
}
function GameDetail() {
  return <div className="wrap">Game detail</div>;
}
function GroupsDirectory() {
  return <div className="wrap">Groups directory</div>;
}
function GroupProfile() {
  return <div className="wrap">Group profile</div>;
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
