import { Routes, Route } from "react-router-dom";

function Home() {
  return <div>Home</div>;
}
function GameDetail() {
  return <div>Game detail</div>;
}
function GroupsDirectory() {
  return <div>Groups directory</div>;
}
function GroupProfile() {
  return <div>Group profile</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/game/:id" element={<GameDetail />} />
      <Route path="/groups" element={<GroupsDirectory />} />
      <Route path="/group/:key" element={<GroupProfile />} />
    </Routes>
  );
}
