import CorridorWalk from "../components/CorridorWalk";
import Hero from "../components/Hero";
import SiteSection from "../components/SiteSection";
import Story from "../components/Story";

// One page: the front door - one line, one button - then the corridor walk
// inside a pinned rounded frame with its two resting stops, then the page
// releases into the website below. Must read completely with CSS disabled.
export default function Page() {
  return (
    <main>
      <Hero />
      <CorridorWalk />
      <Story />
      <SiteSection />
    </main>
  );
}
