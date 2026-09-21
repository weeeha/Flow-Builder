"use client"

import * as React from "react"
import { DirectionProvider as BaseDirectionProvider } from "@base-ui/react/direction-provider"
import { Direction as DirectionPrimitive } from "radix-ui"

type Direction = "ltr" | "rtl"

// The corrected direction has to land in the same paint as the first render, or
// an RTL page flashes LTR for a frame. The plain-effect fallback is only there
// to keep React from warning during SSR, where there is nothing to measure.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect

/**
 * The direction the DOM at `node` actually inherits, or `undefined` when
 * nothing above it declares one.
 *
 * `undefined` is deliberately not `"ltr"`. It means "no opinion", which is what
 * lets an enclosing provider stay in charge instead of being clobbered.
 *
 * The walk starts at `parentElement`, never at `node` itself. By the time this
 * runs the primitive has already stamped its own `dir` onto its parts, so a
 * `node.closest("[dir]")` would match that stamp and read back the exact wrong
 * answer this function exists to correct.
 */
function readInheritedDirection(node: Element): Direction | undefined {
  const scope = node.parentElement?.closest("[dir]")
  if (!scope) return undefined

  const attr = scope.getAttribute("dir")?.toLowerCase()
  if (attr === "ltr" || attr === "rtl") return attr

  // `dir="auto"` — the browser has already resolved it against the content.
  return getComputedStyle(scope).direction === "rtl" ? "rtl" : "ltr"
}

interface DirectionProviderProps {
  children?: React.ReactNode
  /**
   * Force a reading direction. Omit it — the normal case — and the direction is
   * read from the nearest `[dir]` ancestor in the DOM.
   */
  dir?: Direction
}

/**
 * Bridges the DOM's reading direction into the two context systems this kit is
 * built on.
 *
 * Both Radix and Base UI resolve direction from React context and never from
 * the DOM, then stamp a real `dir` attribute onto their parts. That stamp does
 * not merely fail to flip — it *overrides* the direction the element would have
 * inherited, so logical padding (`ps-*` / `pe-*`) resolves the wrong way round.
 * Measured on Select before this existed: inside a `<div dir="rtl">` the chevron
 * stayed 9px from the trigger's physical RIGHT edge while the label above it
 * flipped, because Radix had written `dir="ltr"` onto the trigger.
 *
 * So the DOM is the source of truth for direction in this kit, exactly as it is
 * for theme (`.dark` on `<html>`). Set `dir` on an ancestor — `<html>`, or any
 * wrapper around one RTL section — and every component below it follows. That
 * consistency is the point: a consumer should not have to learn that direction
 * is configured through a different channel than everything else.
 *
 * Kit components wrap their own root in this, so it is not something a consumer
 * needs to mount. Reach for it directly only to force a direction that
 * contradicts the DOM.
 */
function DirectionProvider({ children, dir }: DirectionProviderProps) {
  const auto = dir === undefined
  const [probe, setProbe] = React.useState<HTMLSpanElement | null>(null)
  const [domDir, setDomDir] = React.useState<Direction | undefined>(undefined)

  useIsomorphicLayoutEffect(() => {
    if (!auto || !probe) return

    const read = () => setDomDir(readInheritedDirection(probe))
    read()

    // A locale switch flips `dir` on elements that are already mounted, and on
    // a page that declared no direction at all it adds the FIRST one. So watch
    // the document root as well as whatever scope we resolved — watching only
    // the scope means a page that starts undeclared registers no observer and
    // stays stuck LTR through every later switch.
    const observer = new MutationObserver(read)
    const scope = probe.parentElement?.closest("[dir]")
    const targets = new Set<Element>([document.documentElement])
    if (scope) targets.add(scope)
    targets.forEach((target) =>
      observer.observe(target, { attributes: true, attributeFilter: ["dir"] })
    )
    return () => observer.disconnect()
  }, [auto, probe])

  // The ambient value is the floor: whatever an enclosing provider set, or
  // "ltr" when there is none. A measured direction outranks it; nothing at all
  // in the DOM leaves it untouched.
  const ambient = DirectionPrimitive.useDirection()
  const resolved = dir ?? domDir ?? ambient

  return (
    <>
      {auto ? (
        // Select, DropdownMenu and ContextMenu roots render no element of their
        // own, so several components have no node to measure from. One probe
        // used everywhere beats two mechanisms to keep in sync. `display:none`
        // keeps it fully out of layout: it is not a flex or grid item and
        // contributes no gap.
        <span
          ref={setProbe}
          data-slot="direction-probe"
          style={{ display: "none" }}
        />
      ) : null}
      <DirectionPrimitive.DirectionProvider dir={resolved}>
        <BaseDirectionProvider direction={resolved}>
          {children}
        </BaseDirectionProvider>
      </DirectionPrimitive.DirectionProvider>
    </>
  )
}

export { DirectionProvider }
export type { Direction, DirectionProviderProps }
