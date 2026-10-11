import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui Alert with DESIGN.md status colors: green/red steps 3 (surface), 7 (border), 12 (text).
const alertVariants = cva("w-full rounded-md border px-[11px] py-2.5 text-left text-xs", {
  variants: {
    variant: {
      success: "border-(--green-7) bg-(--green-3) text-(--green-12)",
      error: "border-(--red-7) bg-(--red-3) text-(--red-12)"
    }
  },
  defaultVariants: { variant: "success" }
});

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" data-kind={variant} className={cn(alertVariants({ variant }), className)} {...props} />;
}

export { Alert };
