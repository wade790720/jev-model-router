import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui Button, sized and colored for DESIGN.md: 36px controls, accent primary, neutral secondary with a hairline border.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-transparent font-semibold whitespace-nowrap outline-none select-none touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-65 aria-busy:after:content-['_…'] motion-safe:transition-transform motion-safe:active:not-focus-visible:scale-[.98]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-[color-mix(in_srgb,var(--primary)_88%,black)]",
        secondary: "border-border bg-secondary text-foreground hover:bg-accent active:bg-accent"
      },
      size: {
        default: "min-h-9 px-3.5 py-1.5",
        sm: "min-h-8 px-2.5 py-1.5 text-xs font-medium"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);

function Button({ className, variant, size, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
