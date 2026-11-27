import { memo, useEffect, useState } from "react";
import { iconSetIfLoaded, loadIconSet, type IconRef, type IconSet } from "@/lib/icons";

export function useIconSet(): IconSet | null {
  const [set, setSet] = useState<IconSet | null>(() => iconSetIfLoaded());
  useEffect(() => {
    if (set) return;
    let alive = true;
    loadIconSet().then((s) => alive && setSet(s));
    return () => {
      alive = false;
    };
  }, [set]);
  return set;
}

/** An icon from a stored `{ set, name }`, sized and colored like the element it sits in. */
export const CanvasIcon = memo(function CanvasIcon({
  icon,
  size = 20,
  color,
  strokeWidth = 2,
  className = "",
}: {
  icon: IconRef | string;
  size?: number | string;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  const set = useIconSet();
  const name = typeof icon === "string" ? icon : icon.name;
  const Icon = set?.get(name);
  if (!Icon) return <span className={`inline-block shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden />;
  return (
    <Icon
      data-icon={name}
      size={size}
      color={color ?? "currentColor"}
      strokeWidth={strokeWidth}
      className={`shrink-0 ${className}`}
      aria-hidden
    />
  );
});
