import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/p/$slug")({
  component: function PublicSection() {
    return <Outlet />;
  },
});
