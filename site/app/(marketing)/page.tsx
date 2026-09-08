import CorridorWalk from "../components/CorridorWalk";
import FloatingRail from "../components/FloatingRail";
import Hero from "../components/Hero";
import Proof from "../components/Proof";
import SiteSection from "../components/SiteSection";
import Sources from "../components/Sources";
import TopBar from "../components/TopBar";

/*
 * One page, in the order somebody actually needs it.
 *
 * The header and the front door say what this is and hand over a button. The
 * rails show the only thing the product is about, moving, without asking for
 * a scroll. The proof makes the argument as arithmetic and answers the three
 * questions that follow it. Then where the pieces come from, then the
 * corridor walk - which was the opening and is now the close, because it
 * shows what the thing feels like, and that is worth seeing once you care and
 * worth nothing before. The footer is the way out.
 *
 * What used to sit between the hero and the walk was four full-screen beats
 * of prose and two macro photographs of cloth. Both are gone.
 *
 * Must read completely with CSS disabled.
 */
export default function Page() {
  return (
    <>
      <TopBar />
      <main>
        <Hero />
        <FloatingRail />
        <Proof />
        <Sources />
        <CorridorWalk />
        <SiteSection />
      </main>
    </>
  );
}
