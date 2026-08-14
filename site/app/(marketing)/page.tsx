import CorridorWalk from "../components/CorridorWalk";
import SiteSection from "../components/SiteSection";
import Story from "../components/Story";

// One page: the corridor walk inside a pinned rounded frame — hero line, two
// resting stops where the clothes present the writing — then the page releases
// into the website below. Must read completely with CSS disabled.
export default function Page() {
  return (
    <main>
      <CorridorWalk />
      <Story />
      <SiteSection />
    </main>
  );
}
