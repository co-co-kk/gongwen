import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Meta, StoryFn } from "@storybook/react";
import { Workbook, WorkbookInstance } from "@fortune-sheet/react";
import { CellWidget, Selection, Sheet } from "@fortune-sheet/core";

export default {
  component: Workbook,
} as Meta<typeof Workbook>;

type WidgetTemplateKey = "counter" | "note";

const templates: Record<WidgetTemplateKey, { label: string; color: string }>
  = {
    counter: { label: "可计数按钮", color: "#3478f6" },
    note: { label: "备注标签", color: "#fa8c16" },
  };

const withinSelection = (widget: CellWidget, selection: Selection): boolean => {
  const [rowStart, rowEnd] = selection.row;
  const [colStart, colEnd] = selection.column;
  return widget.r >= rowStart && widget.r <= rowEnd && widget.c >= colStart && widget.c <= colEnd;
};

const selectionContains = (
  widget: CellWidget,
  selections?: Selection[]
): boolean => selections?.some((s) => withinSelection(widget, s)) ?? false;

const buildWidgetNode = (templateKey: WidgetTemplateKey, onIncrement: () => void) => {
  if (templateKey === "counter") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onIncrement();
        }}
        style={{
          width: "100%",
          height: "100%",
          background: templates[templateKey].color,
          border: "none",
          borderRadius: 4,
          color: "#fff",
          cursor: "pointer",
        }}
      >
        点击递增
      </button>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: `${templates[templateKey].color}22`,
        border: `1px solid ${templates[templateKey].color}`,
        borderRadius: 4,
        color: templates[templateKey].color,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {templates[templateKey].label}
    </div>
  );
};

export const DragFormWidgets: StoryFn<typeof Workbook> = () => {
  const workbookRef = useRef<WorkbookInstance>(null);
  const [data, setData] = useState<Sheet[]>([
    {
      name: "Sheet1",
      order: 0,
      column: 12,
      row: 50,
      celldata: [{ r: 0, c: 0, v: { v: "选择单元格后拖入组件" } }],
    },
  ]);
  const [widgets, setWidgets] = useState<CellWidget[]>([]);
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});

  const onChange = useCallback((d: Sheet[]) => setData(d), []);

  const selection = workbookRef.current?.getSelection();

  const addWidgetAtSelection = useCallback(
    (templateKey: WidgetTemplateKey) => {
      const currentSelection = workbookRef.current?.getSelection();
      if (!currentSelection?.length) return;

      const target = currentSelection[0];
      const r = target.row[0];
      const c = target.column[0];

      setWidgets((prev) => {
        const newId = `${templateKey}-${Date.now()}-${Math.random()}`;
        const widget: CellWidget = {
          id: newId,
          r,
          c,
          node: buildWidgetNode(templateKey, () => {
            setClickCounts((counts) => ({ ...counts, [newId]: (counts[newId] || 0) + 1 }));
          }),
        };
        return [...prev.filter((w) => w.id !== newId), widget];
      });
    },
    []
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const key = event.dataTransfer.getData("template") as WidgetTemplateKey;
      if (key) {
        addWidgetAtSelection(key);
      }
    },
    [addWidgetAtSelection]
  );

  const handleDelete = useCallback(() => {
    const currentSelection = workbookRef.current?.getSelection();
    if (!currentSelection?.length) return;

    setWidgets((prev) => prev.filter((widget) => !selectionContains(widget, currentSelection)));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        handleDelete();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDelete]);

  const palette = useMemo(
    () =>
      (Object.keys(templates) as WidgetTemplateKey[]).map((key) => (
        <div
          key={key}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("template", key);
          }}
          onClick={() => addWidgetAtSelection(key)}
          style={{
            border: `1px solid ${templates[key].color}`,
            borderRadius: 6,
            padding: "12px 16px",
            color: templates[key].color,
            cursor: "grab",
            background: "#fff",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            marginBottom: 12,
          }}
        >
          {templates[key].label}
        </div>
      )),
    [addWidgetAtSelection]
  );

  return (
    <div
      style={{ display: "flex", height: "100vh", gap: 16, padding: 16, boxSizing: "border-box" }}
    >
      <div style={{ width: 220 }}>
        <h3 style={{ marginTop: 0 }}>拖入组件</h3>
        <p style={{ color: "#666", fontSize: 12, marginTop: 0 }}>
          先选择目标单元格，再拖拽或点击组件放置。Delete/Backspace 可移除选区中的组件。
        </p>
        {palette}
      </div>
      <div style={{ flex: 1, minWidth: 0 }} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <Workbook ref={workbookRef} data={data} onChange={onChange} cellWidgets={widgets} />
        <div style={{ marginTop: 12, color: "#444" }}>
          {Object.entries(clickCounts).map(([id, count]) => (
            <div key={id}>{`组件 ${id} 已被点击 ${count} 次`}</div>
          ))}
          {!selection?.length && <div>选择一个单元格以放置组件。</div>}
        </div>
      </div>
    </div>
  );
};
