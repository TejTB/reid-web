"use client";
import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type CheckboxProps = React.ComponentPropsWithoutRef<
  typeof CheckboxPrimitive.Root
>;

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, ...props }, ref) => {
  const [isChecked, setIsChecked] = React.useState<boolean | "indeterminate">(
    props?.checked ?? props?.defaultChecked ?? false,
  );

  React.useEffect(() => {
    setIsChecked(props?.checked ?? props?.defaultChecked ?? false);
  }, [props?.checked, props?.defaultChecked]);

  return (
    <CheckboxPrimitive.Root
      {...props}
      onCheckedChange={(checked) => {
        setIsChecked(checked);
        props.onCheckedChange?.(checked);
      }}
      asChild
    >
      <motion.button
        className={cn(
          "peer size-5 flex items-center justify-center shrink-0 rounded-sm",
          "bg-white/5 border border-white/20",
          "transition-colors duration-300",
          "focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "data-[state=checked]:bg-[#B91C1C] data-[state=checked]:border-[#B91C1C]",
          className,
        )}
        ref={ref}
        whileTap={{ scale: 0.92 }}
        whileHover={{ scale: 1.05 }}
      >
        <CheckboxPrimitive.Indicator forceMount asChild>
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="3.5"
            stroke="currentColor"
            className="size-3 text-white"
            initial="unchecked"
            animate={isChecked === true ? "checked" : "unchecked"}
          >
            <motion.path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4.5 12.75l6 6 9-13.5"
              variants={{
                checked: {
                  pathLength: 1,
                  opacity: 1,
                  transition: { duration: 0.2, delay: 0.1 },
                },
                unchecked: {
                  pathLength: 0,
                  opacity: 0,
                  transition: { duration: 0.15 },
                },
              }}
            />
          </motion.svg>
        </CheckboxPrimitive.Indicator>
      </motion.button>
    </CheckboxPrimitive.Root>
  );
});

Checkbox.displayName = CheckboxPrimitive.Root.displayName;
export { Checkbox, type CheckboxProps };
