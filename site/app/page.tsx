import SmoothScroll from "./components/SmoothScroll";
import Cursor from "./components/Cursor";
import Hero from "./components/Hero";
import FrameScrubber from "./components/FrameScrubber";
import EndWall from "./components/EndWall";
import SiteSection from "./components/SiteSection";
import DustOverlay from "./components/DustOverlay";

// One page: the wardrobe opens, the camera walks the corridor as you scroll,
// arrives at the end wall where the clothes carry the writing — then the page
// settles into the actual website. Must read completely with CSS disabled.
export default function Page() {
  return (
    <main>
      <SmoothScroll />
      <Cursor />
      <DustOverlay />

      <Hero />
      <FrameScrubber />
      <EndWall />
      <SiteSection />
    </main>
  );
}
