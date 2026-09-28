import { courses } from "@/lib/vault";
import { MODE } from "@/lib/store";
import { Notebook } from "@/components/Notebook";

export const dynamic = "force-dynamic";

export default async function Write() {
  const cs = await courses();
  return <Notebook courses={cs.map((c) => c.name)} cloud={MODE === "cloud"} />;
}
