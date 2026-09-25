import { memo, useMemo, useState } from 'react'
import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  GeoShapeGeoStyle,
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
  TldrawUiButtonIcon,
  TldrawUiMenuContextProvider,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  ToolbarItem,
  TriangleToolbarItem,
  useEditor,
  useTranslation,
  useValue,
  XBoxToolbarItem,
} from 'tldraw'

/**
 * Vertical Focus toolbar pinned to the right.
 * Keeps in view:
 *   1. Select (pointer cursor)
 *   2. Task (focus-task card)
 *   3. Text
 *   4. Rectangle
 *   5. Arrow
 *   6. Draw
 *   + (Active tool from submenu if currently selected)
 * All other tools are collapsed into the popup submenu.
 */
export const FocusToolbar = memo(function FocusToolbar() {
  const editor = useEditor()
  const msg = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  const activeToolId = useValue('current tool id', () => editor.getCurrentToolId(), [editor])
  const activeGeo = useValue('current geo', () => {
    if (editor.getCurrentToolId() === 'geo') {
      return editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle)
    }
    return null
  }, [editor])

  // If a secondary tool from the submenu is active, temporarily surface it in the toolbar
  const activeOverflowItem = useMemo(() => {
    if (
      activeToolId === 'select' ||
      activeToolId === 'focus-task' ||
      activeToolId === 'text' ||
      (activeToolId === 'geo' && (activeGeo === 'rectangle' || !activeGeo)) ||
      activeToolId === 'arrow' ||
      activeToolId === 'draw'
    ) {
      return null
    }

    switch (activeToolId) {
      case 'hand':
        return <HandToolbarItem key="active-hand" />
      case 'eraser':
        return <EraserToolbarItem key="active-eraser" />
      case 'note':
        return <NoteToolbarItem key="active-note" />
      case 'asset':
        return <AssetToolbarItem key="active-asset" />
      case 'line':
        return <LineToolbarItem key="active-line" />
      case 'highlight':
        return <HighlightToolbarItem key="active-highlight" />
      case 'laser':
        return <LaserToolbarItem key="active-laser" />
      case 'frame':
        return <FrameToolbarItem key="active-frame" />
      case 'geo':
        switch (activeGeo) {
          case 'ellipse':
            return <EllipseToolbarItem key="active-ellipse" />
          case 'triangle':
            return <TriangleToolbarItem key="active-triangle" />
          case 'diamond':
            return <DiamondToolbarItem key="active-diamond" />
          case 'hexagon':
            return <HexagonToolbarItem key="active-hexagon" />
          case 'oval':
            return <OvalToolbarItem key="active-oval" />
          case 'rhombus':
            return <RhombusToolbarItem key="active-rhombus" />
          case 'star':
            return <StarToolbarItem key="active-star" />
          case 'cloud':
            return <CloudToolbarItem key="active-cloud" />
          case 'heart':
            return <HeartToolbarItem key="active-heart" />
          case 'x-box':
            return <XBoxToolbarItem key="active-x-box" />
          case 'check-box':
            return <CheckBoxToolbarItem key="active-check-box" />
          case 'arrow-left':
            return <ArrowLeftToolbarItem key="active-arrow-left" />
          case 'arrow-up':
            return <ArrowUpToolbarItem key="active-arrow-up" />
          case 'arrow-down':
            return <ArrowDownToolbarItem key="active-arrow-down" />
          case 'arrow-right':
            return <ArrowRightToolbarItem key="active-arrow-right" />
          default:
            return null
        }
      default:
        return null
    }
  }, [activeToolId, activeGeo])

  return (
    <div className="tlui-toolbar">
      <div className="tlui-toolbar__inner">
        <div className="tlui-toolbar__left">
          <TldrawUiToolbar className="tlui-toolbar__tools" label={msg('tool-panel.title')}>
            <div className="tlui-toolbar__tools__list">
              <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
                <SelectToolbarItem />
                <ToolbarItem tool="focus-task" />
                <TextToolbarItem />
                <RectangleToolbarItem />
                <ArrowToolbarItem />
                <DrawToolbarItem />
                {activeOverflowItem}
              </TldrawUiMenuContextProvider>
            </div>

            <TldrawUiPopover id="focus-toolbar-overflow" open={isOpen} onOpenChange={setIsOpen}>
              <TldrawUiPopoverTrigger>
                <TldrawUiToolbarButton
                  title={msg('tool-panel.more')}
                  type="tool"
                  className="tlui-toolbar__overflow"
                  data-testid="tools.more-button"
                >
                  <TldrawUiButtonIcon icon={isOpen ? 'chevron-right' : 'chevron-left'} />
                </TldrawUiToolbarButton>
              </TldrawUiPopoverTrigger>
              <TldrawUiPopoverContent side="left" align="center" sideOffset={12}>
                <TldrawUiToolbar
                  className="tlui-buttons__grid"
                  data-testid="tools.more-content"
                  label={msg('tool-panel.more')}
                  onClick={() => setIsOpen(false)}
                >
                  <TldrawUiMenuContextProvider type="toolbar-overflow" sourceId="toolbar">
                    <HandToolbarItem />
                    <EraserToolbarItem />
                    <NoteToolbarItem />
                    <AssetToolbarItem />

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
                  </TldrawUiMenuContextProvider>
                </TldrawUiToolbar>
              </TldrawUiPopoverContent>
            </TldrawUiPopover>
          </TldrawUiToolbar>
        </div>
      </div>
    </div>
  )
})
