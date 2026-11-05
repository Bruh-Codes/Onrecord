"use client";

/**
 * Bottom drawer in the style of shadcn/ui's Drawer (built on vaul).
 */

import type { ComponentProps } from "react";
import { Drawer as DrawerPrimitive } from "vaul";

export function Drawer(props: ComponentProps<typeof DrawerPrimitive.Root>) {
	return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

export const DrawerTrigger = DrawerPrimitive.Trigger;
export const DrawerClose = DrawerPrimitive.Close;

export function DrawerContent({ className = "", children, ...props }: ComponentProps<typeof DrawerPrimitive.Content>) {
	return (
		<DrawerPrimitive.Portal>
			<DrawerPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/40" />
			<DrawerPrimitive.Content
				className={`fixed inset-x-0 bottom-0 z-[61] mt-24 flex max-h-[88dvh] flex-col rounded-t-[20px] border-t border-border bg-card outline-none ${className}`}
				{...props}
			>
				<div aria-hidden className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-foreground/15" />
				{children}
			</DrawerPrimitive.Content>
		</DrawerPrimitive.Portal>
	);
}

export function DrawerHeader({ className = "", ...props }: ComponentProps<"div">) {
	return <div className={`flex flex-col gap-1 px-5 pt-4 pb-2 ${className}`} {...props} />;
}

export function DrawerFooter({ className = "", ...props }: ComponentProps<"div">) {
	return <div className={`mt-auto flex flex-col gap-2 px-5 pb-5 pt-3 ${className}`} {...props} />;
}

export function DrawerTitle({ className = "", ...props }: ComponentProps<typeof DrawerPrimitive.Title>) {
	return <DrawerPrimitive.Title className={`m-0 text-[18px] font-semibold ${className}`} {...props} />;
}

export function DrawerDescription({ className = "", ...props }: ComponentProps<typeof DrawerPrimitive.Description>) {
	return <DrawerPrimitive.Description className={`m-0 text-[13px] text-foreground/60 ${className}`} {...props} />;
}
