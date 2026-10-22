import { createLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import { Button } from "@/ui/Button";
import { useAccount } from "./AccountProvider";
import { VIEWABLE_STATUSES } from "./types";

const LinkedButton = createLink(Button);
export function PlayLink(props: Omit<ComponentProps<typeof Button>, "href">) {
  const account = useAccount();
  return (
    <LinkedButton {...props} to={VIEWABLE_STATUSES.includes(account.status) ? "/arena" : "/join"} />
  );
}
