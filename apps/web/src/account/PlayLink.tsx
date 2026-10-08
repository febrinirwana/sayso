import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { Button } from "@/ui/Button";
import { useAccount } from "./AccountProvider";

const LinkedButton = createLink(Button);
export function PlayLink(props: Omit<ComponentProps<typeof Button>, "href">) {
  const account = useAccount();
  return <LinkedButton {...props} to={account.status === "ready" ? "/arena" : "/join"} />;
}
