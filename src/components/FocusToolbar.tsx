import { memo } from 'react'
import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultToolbar,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StarToolbarItem,
  TextToolbarItem,
  ToolbarItem,
  TriangleToolbarItem,
  XBoxToolbarItem,
} from 'tldraw'

/**
 * Default tldraw bottom toolbar plus Focus task card tool (after sticky note) for click-to-place on canvas.
 */
export const FocusToolbar = memo(function FocusToolbar() {
  return (
    <DefaultToolbar>
      <>
        <SelectToolbarItem />
        <HandToolbarItem />
        <DrawToolbarItem />
        <EraserToolbarItem />
        <ArrowToolbarItem />
        <TextToolbarItem />
        <NoteToolbarItem />
        <ToolbarItem tool="focus-task" />
        <AssetToolbarItem />

        <RectangleToolbarItem />
        <EllipseToolbarItem />
        <TriangleToolbarItem />
        <DiamondToolbarItem />

        <HexagonToolbarItem />
        <OvalToolbarItem />
        <RhombusToolbarItem />
        <StarToolbarItem />

        <CloudToolbarItem />
        <HeartToolbarItem />
        <XBoxToolbarItem />
        <CheckBoxToolbarItem />

        <ArrowLeftToolbarItem />
        <ArrowUpToolbarItem />
        <ArrowDownToolbarItem />
        <ArrowRightToolbarItem />

        <LineToolbarItem />
        <HighlightToolbarItem />
        <LaserToolbarItem />
        <FrameToolbarItem />
      </>
    </DefaultToolbar>
  )
})
