import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/schools/$schoolId")({
  beforeLoad: () => {
    throw redirect({ to: "/partners" });
  },
});
