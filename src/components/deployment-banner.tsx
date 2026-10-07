import { getDeploymentBanner } from "@/lib/crm/deployment";
import type { DeploymentBannerKind } from "@/lib/deployment-banner";
import { useEffect, useState } from "react";

const TEXT: Record<Exclude<DeploymentBannerKind, null>, string> = {
  copy: "Preview copy. Changes here are thrown away and never reach the live site.",
  live: "This preview uses the LIVE database. Changes here change the live site.",
  test: "Test copy on this computer. Nothing here reaches the live site.",
  unknown: "Not the live site. Its database could not be identified, so treat it as the live one.",
};

export function DeploymentBanner() {
  const [kind, setKind] = useState<Exclude<DeploymentBannerKind, null> | null>(null);

  useEffect(() => {
    getDeploymentBanner()
      .then((value) => setKind(value))
      .catch(() => setKind(null));
  }, []);

  if (!kind) return null;
  const tone = kind === "live" || kind === "unknown" ? "bg-danger" : "bg-bronze";
  return (
    <div role="status" className={`px-4 py-2 text-center text-sm font-medium text-paper ${tone}`}>
      {TEXT[kind]}
    </div>
  );
}
