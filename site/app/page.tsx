import SmoothScroll from "./components/SmoothScroll";
import Cursor from "./components/Cursor";
import Hero from "./components/Hero";
import FrameScrubber from "./components/FrameScrubber";
import Corridor from "./components/Corridor";
import ClosingBay from "./components/ClosingBay";
import DustOverlay from "./components/DustOverlay";

// One page, one continuous walk deeper into a closet. The page must make
// complete sense with CSS disabled: every section is semantic, every bay has a
// real heading, and the reading order is the visual order.
export default function Page() {
  return (
    <main>
      <SmoothScroll />
      <Cursor />
      <DustOverlay />

      <Hero />
      <FrameScrubber />
      <Corridor />
      <ClosingBay />
    </main>
  );
}
