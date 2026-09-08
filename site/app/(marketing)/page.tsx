import CorridorWalk from "../components/CorridorWalk";
import Hero from "../components/Hero";
import SiteSection from "../components/SiteSection";
import Story from "../components/Story";
import TopBar from "../components/TopBar";

/*
 * One page, in the order somebody actually needs it.
 *
 * The header and the front door say what this is and hand over a button. The
 * story answers what it does. Then the corridor walk, which was the opening
 * and is now the close: it shows what the thing feels like, which is worth
 * seeing once you care and worth nothing before. The footer is the way out.
 *
 * Must read completely with CSS disabled.
 */
export default function Page() {
  return (
    <>
      <TopBar />
      <main>
        <Hero />
        <Story />
        <CorridorWalk />
        <SiteSection />
      </main>
    </>
  );
}
