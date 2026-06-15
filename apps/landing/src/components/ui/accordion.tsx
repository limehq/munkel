import type { ComponentProps } from 'react'
import * as AccordionPrimitive from '@radix-ui/react-accordion'
import { Plus } from 'lucide-react'

import { cn } from '@/lib/utils'

function Accordion(props: ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn(
        'overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card transition-[border-color,background] duration-200',
        'hover:border-ring',
        'data-[state=open]:border-[var(--faq-border-open)] data-[state=open]:bg-[var(--faq-card-open)]',
        className,
      )}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          'group flex flex-1 cursor-pointer items-center justify-between gap-5 px-6 py-5 text-left text-[length:var(--text-lg)] font-medium text-balance outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <span
          aria-hidden
          className={cn(
            'flex size-[30px] flex-none items-center justify-center rounded-full border border-border bg-background text-muted-foreground',
            'transition-[rotate,color,border-color,background] duration-200',
            'group-data-[state=open]:rotate-[135deg] group-data-[state=open]:bg-[var(--brand-soft)] group-data-[state=open]:text-brand group-data-[state=open]:border-[var(--faq-toggle-border-open)]',
          )}
        >
          <Plus />
        </span>
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden data-[state=closed]:animate-[accordion-up_0.28s_cubic-bezier(0.4,0,0.2,1)] data-[state=open]:animate-[accordion-down_0.32s_cubic-bezier(0.4,0,0.2,1)]"
      {...props}
    >
      <div
        className={cn(
          'max-w-[64ch] px-6 pb-[1.375rem] text-base leading-relaxed text-pretty text-muted-foreground',
          className,
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
