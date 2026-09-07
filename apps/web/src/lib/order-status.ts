import { OrderStatus } from "./types";

export function statusTone(status: OrderStatus): "neutral" | "accent" | "danger" {
  if (status === "COMPLETED") return "accent";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}
