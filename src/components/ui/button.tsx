import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes } from "react";

const button = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-opacity duration-150 disabled:opacity-50 min-h-11 px-4 text-sm",
  {
    variants: {
      variant: {
        primary: "bg-bronze text-bronze-fg hover:opacity-90 rounded-md",
        secondary: "border border-line bg-surface text-ink hover:bg-paper-2 rounded-md",
        ghost: "text-ink-soft hover:bg-paper-2 rounded-md",
        danger: "bg-danger text-paper hover:opacity-90 rounded-md",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={twMerge(button({ variant }), className)} {...props} />;
}
