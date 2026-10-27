import { createFileRoute } from "@tanstack/react-router";
import { GameApp } from "@/components/td/GameApp";

export const Route = createFileRoute("/")({
  component: GameApp,
});
