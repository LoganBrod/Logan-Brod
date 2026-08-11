import SmoothScroll from "./components/SmoothScroll";
import Cursor from "./components/Cursor";
import Header from "./components/Header";
import CorridorWalk from "./components/CorridorWalk";
import SiteSection from "./components/SiteSection";

// One page: a wordmark bar, the corridor walk inside a pinned rounded frame —
// hero line, two resting stops where the clothes present the writing — then
// the page releases into the website below. Must read completely with CSS
// disabled.
export default function Page() {
  return (
    <main>
      <SmoothScroll />
      <Cursor />

      <Header />
      <CorridorWalk />
      <SiteSection />
    </main>
  );
}
