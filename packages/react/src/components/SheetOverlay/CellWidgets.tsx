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
        const [top, bottom] = rowLocationByIndex(
          widget.r,
          context.visibledatarow
        );
        const [left, right] = colLocationByIndex(
          widget.c,
          context.visibledatacolumn
        );

        const width = widget.width ?? right - left - 1;
        const height = widget.height ?? bottom - top - 1;

        return (
          <div
            key={widget.id}
            className="fortune-cell-widget"
            onClick={stopEvent}
            onMouseDown={stopEvent}
            onDoubleClick={stopEvent}
            onKeyDown={stopEvent}
            onContextMenu={stopEvent}
            style={{
              left: left + (widget.offsetX ?? 0),
              top: top + (widget.offsetY ?? 0),
              width,
              height,
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
