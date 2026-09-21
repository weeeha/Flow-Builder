"use client"

// Unlisted demo route for the components/ui primitive layer copied from the
// Minimal Design System. Not linked from anywhere — visit directly at
// /ui-kit. Renders each of the 9 primitives once for visual verification.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FLOW_STATUSES } from "@/components/flow/flow-types"
import { MediaSlot } from "@/components/flow/media-slot"
import { NodePrompt } from "@/components/flow/node-prompt"
import { NodeStatusBadge } from "@/components/flow/node-status"
import { RunButton } from "@/components/flow/run-button"

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  )
}

export default function UiKitPage() {
  const [expandedPrompt, setExpandedPrompt] = React.useState(
    "A cat wearing sunglasses, skateboarding down a boardwalk at sunset."
  )
  const [collapsedPrompt, setCollapsedPrompt] = React.useState(
    "A cat wearing sunglasses, skateboarding down a boardwalk at sunset."
  )
  const [promptCollapsed, setPromptCollapsed] = React.useState(true)

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-background p-8 text-foreground">
        <div className="mx-auto max-w-4xl">
          <h1 className="mb-1 text-xl font-semibold">components/ui</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Unlisted verification page for the 9 copied design-system
            primitives.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Section title="Button">
              <Button>Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </Section>

            <Section title="Input">
              <Input placeholder="Type something…" />
            </Section>

            <Section title="Textarea">
              <Textarea placeholder="Type a longer note…" />
            </Section>

            <Section title="Select">
              <Select defaultValue="a">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a">Option A</SelectItem>
                  <SelectItem value="b">Option B</SelectItem>
                  <SelectItem value="c">Option C</SelectItem>
                </SelectContent>
              </Select>
            </Section>

            <Section title="Tooltip">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline">Hover me</Button>
                </TooltipTrigger>
                <TooltipContent>This is a tooltip</TooltipContent>
              </Tooltip>
            </Section>

            <Section title="Popover">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Open popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  A simple popover body, rendered from
                  components/ui/popover.tsx.
                </PopoverContent>
              </Popover>
            </Section>

            <Section title="Dialog">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Open dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Dialog title</DialogTitle>
                    <DialogDescription>
                      A simple dialog body, rendered from
                      components/ui/dialog.tsx.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter showCloseButton />
                </DialogContent>
              </Dialog>
            </Section>

            <Section title="Skeleton">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            </Section>

            <Section title="Dropdown Menu">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Open menu</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive">
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Section>
          </div>

          <h2 className="mt-10 mb-1 text-xl font-semibold">Flow Kit</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Verification page for the components/flow primitives copied
            alongside the tts-node.tsx conversion.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Section title="NodePrompt">
              <div className="flex w-full flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Expanded</span>
                  <NodePrompt
                    value={expandedPrompt}
                    onChange={setExpandedPrompt}
                    placeholder="Describe the image…"
                    rows={3}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">Collapsed</span>
                  <NodePrompt
                    value={collapsedPrompt}
                    onChange={setCollapsedPrompt}
                    collapsed={promptCollapsed}
                    onExpand={() => setPromptCollapsed(false)}
                  />
                </div>
              </div>
            </Section>

            <Section title="MediaSlot">
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">idle</span>
                  <MediaSlot kind="audio" status="idle" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">streaming</span>
                  <MediaSlot kind="audio" status="streaming" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">failed</span>
                  <MediaSlot kind="audio" status="failed" />
                </div>
              </div>
            </Section>

            <Section title="NodeStatusBadge">
              {FLOW_STATUSES.map((status) => (
                <NodeStatusBadge key={status} status={status} />
              ))}
            </Section>

            <Section title="RunButton">
              <RunButton status="idle" onRun={() => {}} />
              <RunButton status="streaming" onRun={() => {}} onStop={() => {}} />
              <RunButton status="queued" onRun={() => {}} />
              <RunButton status="locked" onRun={() => {}} />
              <RunButton
                status="idle"
                onRun={() => {}}
                onRunFrom={() => {}}
                onRunSelection={() => {}}
                onRunAll={() => {}}
              />
            </Section>
          </div>
        </div>
      </main>
    </TooltipProvider>
  )
}
