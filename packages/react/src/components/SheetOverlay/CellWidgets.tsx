import React, { useContext, useMemo } from "react";
import { colLocationByIndex, rowLocationByIndex } from "@fortune-sheet/core";
import WorkbookContext from "../../context";

const stopEvent = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

const CellWidgets: React.FC = () => {
  const { context, settings } = useContext(WorkbookContext);

  const widgets = useMemo(
    () =>
      (settings.cellWidgets || []).filter(
        (widget) => !widget.sheetId || widget.sheetId === context.currentSheetId
      ),
    [context.currentSheetId, settings.cellWidgets]
  );

  if (widgets.length === 0) return null;

  return (
    <div className="fortune-cell-widgets" aria-hidden>
      {widgets.map((widget) => {

        const sheet = context.luckysheetfile.find(
          (item) => item.id === context.currentSheetId
        );
        const merge = sheet?.config?.merge;
        const mergeKey = Object.keys(merge || {}).find((key) => {
          const block = merge?.[key];
          if (!block) return false;
          return (
            widget.r >= block.r &&
            widget.r < block.r + block.rs &&
            widget.c >= block.c &&
            widget.c < block.c + block.cs
          );
        });

        const topRow = mergeKey && merge ? merge[mergeKey].r : widget.r;
        const leftCol = mergeKey && merge ? merge[mergeKey].c : widget.c;
        const bottomRow =
          mergeKey && merge
            ? merge[mergeKey].r + merge[mergeKey].rs - 1
            : widget.r;
        const rightCol =
          mergeKey && merge
            ? merge[mergeKey].c + merge[mergeKey].cs - 1
            : widget.c;

        const [top] = rowLocationByIndex(topRow, context.visibledatarow);
        const [, bottom] = rowLocationByIndex(
          bottomRow,
          context.visibledatarow
        );
        const [left] = colLocationByIndex(leftCol, context.visibledatacolumn);
        const [, right] = colLocationByIndex(
          rightCol,

          context.visibledatacolumn
        );

        const width = widget.width ?? right - left - 1;
        const height = widget.height ?? bottom - top - 1;


        const stopHandler = widget.passthroughEvents ? undefined : stopEvent;
        const pointerEvents = widget.passthroughEvents ? "none" : undefined;


        return (
          <div
            key={widget.id}
            className="fortune-cell-widget"

            onClick={stopHandler}
            onMouseDown={stopHandler}
            onDoubleClick={stopHandler}
            onKeyDown={stopHandler}
            onContextMenu={stopHandler}

            style={{
              left: left + (widget.offsetX ?? 0),
              top: top + (widget.offsetY ?? 0),
              width,
              height,

              pointerEvents,

            }}
          >
            {widget.node}
          </div>
        );
      })}
    </div>
  );
};


export default CellWidgets;

