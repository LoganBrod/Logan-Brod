import Workbench from "./Workbench";

export default function VideoPage({ params }: { params: { id: string } }) {
  return <Workbench id={params.id} />;
}
