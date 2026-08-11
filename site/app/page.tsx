import SmoothScroll from "./components/SmoothScroll";
import Cursor from "./components/Cursor";
import Hero from "./components/Hero";
import CorridorWalk from "./components/CorridorWalk";
import EndWall from "./components/EndWall";
import SiteSection from "./components/SiteSection";
import DustOverlay from "./components/DustOverlay";

// One continuous move: the wardrobe opens, the walk begins, the camera rests
// twice while the clothes present the writing, then the corridor releases into
// the arrival and the page settles into the actual website. Must read
// completely with CSS disabled.
export default function Page() {
  return (
    <main>
      <SmoothScroll />
      <Cursor />
      <DustOverlay />

      <Hero />
      <CorridorWalk />
      <EndWall />
      <SiteSection />
    </main>
  );
}
