import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "success" | "danger" | "dark-outline";

const variantClasses: Record<Variant, string> = {
  primary: "bg-ink text-paper",
  secondary: "bg-transparent border border-ink/16 text-ink",
  success: "bg-positive text-white",
  danger: "bg-transparent border border-negative text-negative",
  "dark-outline": "bg-transparent border border-white/30 text-paper",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function PillButton({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      type="button"
      className={`rounded-full text-[13px] px-4 py-2 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
