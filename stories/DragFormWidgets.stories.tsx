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

type WidgetTemplateKey = "text" | "select" | "note";

type WidgetInstance = {
  id: string;
  r: number;
  c: number;
  sheetId: string;
  template: WidgetTemplateKey;
  value: string;
  required?: boolean;
};

type TemplateConfig = {
  label: string;
  color: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

const templates: Record<WidgetTemplateKey, TemplateConfig> = {
  text: {
    label: "输入框 (必填)",
    color: "#3478f6",
    required: true,
    placeholder: "请输入内容",
  },
  select: {
    label: "下拉框",
    color: "#52c41a",
    options: ["选项A", "选项B", "选项C"],
    placeholder: "请选择",
  },
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

const findMergeAnchor = (
  sheet: Sheet | undefined,
  row: number,
  column: number
): { r: number; c: number } => {
  const merge = sheet?.config?.merge;
  if (!merge) return { r: row, c: column };

  for (const key of Object.keys(merge)) {
    const block = merge[key];
    if (
      row >= block.r &&
      row < block.r + block.rs &&
      column >= block.c &&
      column < block.c + block.cs
    ) {
      return { r: block.r, c: block.c };
    }
  }

  return { r: row, c: column };
};

const resolveTargetCells = (ranges: Selection[], sheet: Sheet | undefined) => {
  const targets: { r: number; c: number }[] = [];
  const seen = new Set<string>();

  ranges.forEach((range) => {
    for (let r = range.row[0]; r <= range.row[1]; r += 1) {
      for (let c = range.column[0]; c <= range.column[1]; c += 1) {
        const anchor = findMergeAnchor(sheet, r, c);
        const key = `${anchor.r}-${anchor.c}`;
        if (!seen.has(key)) {
          seen.add(key);
          targets.push(anchor);
        }
      }
    }
  });

  return targets;
};

const isCellEmpty = (value: any) =>
  value === undefined || value === null || value === "" || (typeof value === "object" && Object.keys(value).length === 0);

const stopEvent = (e: React.SyntheticEvent) => {
  e.stopPropagation();
};

export const DragFormWidgets: StoryFn<typeof Workbook> = () => {
  const workbookRef = useRef<WorkbookInstance>(null);
  const [data, setData] = useState<Sheet[]>([
    {
      id: "sheet-1",
      name: "Sheet1",
      order: 0,
      column: 12,
      row: 50,
      celldata: [{ r: 0, c: 0, v: { v: "选择单元格后拖入组件" } }],
    },
  ]);
  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [selection, setSelection] = useState<Selection[] | undefined>(undefined);
  const [activeSheetId, setActiveSheetId] = useState<string | undefined>(undefined);
  const [submitResult, setSubmitResult] = useState<string>("");
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<"edit" | "preview">("edit");

  const onChange = useCallback((d: Sheet[]) => setData(d), []);

  const getCurrentSheet = useCallback(() => {
    try {
      return workbookRef.current?.getSheet();
    } catch (err) {
      console.warn("Unable to resolve current sheet", err);
      return undefined;
    }
  }, []);

  const getCurrentSheetId = useCallback(() => {
    const sheetId = getCurrentSheet()?.id;
    return sheetId ?? activeSheetId;
  }, [activeSheetId, getCurrentSheet]);

  useEffect(() => {
    if (!activeSheetId && data.length > 0 && data[0].id) {
      setActiveSheetId(data[0].id);
    }
  }, [activeSheetId, data]);

  const updateWidgetValue = useCallback((id: string, value: string) => {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, value } : w)));
  }, []);

  const removeWidgets = useCallback((predicate: (w: WidgetInstance) => boolean) => {
    setWidgets((prev) => prev.filter((w) => !predicate(w)));
  }, []);

  const removeWidgetsInSelection = useCallback(
    (ranges?: Selection[], sheetId?: string) => {
      if (!ranges?.length) return;
      removeWidgets(
        (w) => w.sheetId === sheetId && selectionContains({ ...w, node: null } as CellWidget, ranges)
      );
    },
    [removeWidgets]
  );

  const createWidgetInstances = useCallback(
    (templateKey: WidgetTemplateKey, sheetId: string, targets: { r: number; c: number }[]) => {
      const instances: WidgetInstance[] = [];
      targets.forEach((target) => {
        const newId = `${templateKey}-${target.r}-${target.c}-${sheetId}-${Date.now()}-${Math.random()}`;
        instances.push({
          id: newId,
          r: target.r,
          c: target.c,
          sheetId,
          template: templateKey,
          value: "",
          required: templates[templateKey].required,
        });
      });
      return instances;
    },
    []
  );

  const addWidgetAtSelection = useCallback(
    (templateKey: WidgetTemplateKey) => {
      const currentSelection = workbookRef.current?.getSelection();
      const currentSheet = getCurrentSheet();
      const sheetId = currentSheet?.id || activeSheetId;
      if (!currentSelection?.length || !sheetId) return;

      setWidgets((prev) => {
        const targets = resolveTargetCells(currentSelection, currentSheet);
        const instances = createWidgetInstances(templateKey, sheetId, targets);
        // Remove existing widgets that collide with the new cells so they get replaced.
        const occupied = new Set(instances.map((w) => `${w.r}-${w.c}`));
        const remaining = prev.filter(
          (w) => w.sheetId !== sheetId || !occupied.has(`${w.r}-${w.c}`)
        );
        return [...remaining, ...instances];
      });
    },
    [activeSheetId, createWidgetInstances]
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
    const currentSheetId = getCurrentSheetId();
    if (!currentSelection?.length || !currentSheetId) return;
    removeWidgetsInSelection(currentSelection, currentSheetId);
  }, [activeSheetId, getCurrentSheetId, removeWidgetsInSelection]);

  const clearSelectionContent = useCallback(() => {
    const currentSelection = workbookRef.current?.getSelection();
    const currentSheetId = getCurrentSheetId();
    if (!currentSelection?.length || !currentSheetId) return;

    currentSelection.forEach((range) => {
      for (let r = range.row[0]; r <= range.row[1]; r += 1) {
        for (let c = range.column[0]; c <= range.column[1]; c += 1) {
          workbookRef.current?.clearCell(r, c, { sheetId: currentSheetId });
        }
      }
    });

    removeWidgetsInSelection(currentSelection, currentSheetId);
  }, [activeSheetId, removeWidgetsInSelection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        handleDelete();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDelete]);

  useEffect(() => {
    const currentSheetId = getCurrentSheetId();
    if (currentSheetId && currentSheetId !== activeSheetId) {
      setActiveSheetId(currentSheetId);
    }
  }, [activeSheetId, data, getCurrentSheetId]);

  const hooks = useMemo(
    () => ({
      afterSelectionChange: (_sheetId: string, newSelection: Selection) => {
        setActiveSheetId((prev) => prev ?? _sheetId);
        setSelection((prev) => {
          if (!prev?.length) return [newSelection];
          const [first, ...rest] = prev;
          if (
            first.column[0] === newSelection.column[0] &&
            first.column[1] === newSelection.column[1] &&
            first.row[0] === newSelection.row[0] &&
            first.row[1] === newSelection.row[1]
          ) {
            return prev;
          }
          return [newSelection, ...rest];
        });
      },
      afterUpdateCell: (row: number, column: number, _oldValue: any, newValue: any) => {
        const currentSheetId = getCurrentSheetId();
        if (isCellEmpty(newValue) && currentSheetId) {
          removeWidgets((w) => w.sheetId === currentSheetId && w.r === row && w.c === column);
        }
      },
      afterActivateSheet: (id: string) => {
        setActiveSheetId(id);
        setSelection(undefined);
      },
      afterAddSheet: (sheet: Sheet) => {
        setActiveSheetId(sheet.id);
      },
    }),
    [activeSheetId, getCurrentSheetId, removeWidgets]
  );

  const renderedWidgets: CellWidget[] = useMemo(
    () =>
      widgets.map((widget) => {
        const template = templates[widget.template];
        const minHeight = 32;

        const readonly = mode === "edit";
        const pointerEvents = readonly ? "none" : "auto";

        let node: React.ReactNode = null;
        if (widget.template === "text") {
          node = (
            <input
              type="text"
              value={widget.value}
              placeholder={template.placeholder}
              onClick={stopEvent}
              onMouseDown={stopEvent}
              onDoubleClick={stopEvent}
              onKeyDown={stopEvent}
              onChange={(e) => !readonly && updateWidgetValue(widget.id, e.target.value)}
              readOnly={readonly}
              style={{
                width: "100%",
                height: "100%",
                border: `1px solid ${template.color}`,
                borderRadius: 6,
                padding: "0 8px",
                boxSizing: "border-box",
                pointerEvents,
                background: readonly ? "#fafafa" : "#fff",
              }}
            />
          );
        } else if (widget.template === "select") {
          node = (
            <select
              value={widget.value}
              onClick={stopEvent}
              onMouseDown={stopEvent}
              onDoubleClick={stopEvent}
              onKeyDown={stopEvent}
              onChange={(e) => !readonly && updateWidgetValue(widget.id, e.target.value)}
              disabled={readonly}
              style={{
                width: "100%",
                height: "100%",
                border: `1px solid ${template.color}`,
                borderRadius: 6,
                padding: "0 8px",
                boxSizing: "border-box",
                background: readonly ? "#fafafa" : "#fff",
                pointerEvents,
              }}
            >
              <option value="" disabled>
                {template.placeholder}
              </option>
              {template.options?.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          );
        } else {
          node = (
            <div
              onClick={stopEvent}
              onMouseDown={stopEvent}
              onDoubleClick={stopEvent}
              onKeyDown={stopEvent}
              style={{
                width: "100%",
                height: "100%",
                background: `${template.color}22`,
                border: `1px solid ${template.color}`,
                borderRadius: 6,
                color: template.color,
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents,
              }}
            >
              {template.label}
            </div>
          );
        }

        const hasError = validationErrors[widget.id];

        return {
          id: widget.id,
          r: widget.r,
          c: widget.c,
          sheetId: widget.sheetId,
          passthroughEvents: readonly,
          node: (
            <div
              style={{
                width: "100%",
                height: "100%",
                minHeight,
                background: "#fff",
                borderRadius: 8,
                border: `1px solid ${template.color}`,
                boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                overflow: "hidden",
                position: "relative",
                opacity: readonly ? 0.8 : 1,
              }}
            >
              {widget.required && (
                <span
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 8,
                    color: "#ff4d4f",
                    fontSize: 12,
                  }}
                >
                  *
                </span>
              )}
              {readonly ? (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    color: template.color,
                    boxSizing: "border-box",
                    background: "#fafafa",
                  }}
                >
                  {`${template.label}${widget.required ? " (必填)" : ""}`}
                </div>
              ) : (
                node
              )}
              {hasError && (
                <div
                  style={{
                    position: "absolute",
                    left: 8,
                    right: 8,
                    bottom: 4,
                    color: "#ff4d4f",
                    fontSize: 11,
                    lineHeight: "14px",
                    background: "#fff",
                  }}
                >
                  {hasError}
                </div>
              )}
            </div>
          ),
        } as CellWidget;
      }),
    [mode, updateWidgetValue, validationErrors, widgets]
  );

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

  const handleSubmit = useCallback(() => {
    const errors: Record<string, string> = {};
    widgets.forEach((widget) => {
      if (widget.required && isCellEmpty(widget.value)) {
        errors[widget.id] = "必填项未填写";
      }
    });

    setValidationErrors(errors);

    if (Object.keys(errors).length) {
      setSubmitResult("提交失败：请完善必填项");
      return;
    }

    const values = widgets.map((widget) => ({
      cell: `${String.fromCharCode(65 + widget.c)}${widget.r + 1}`,
      type: templates[widget.template].label,
      value: widget.value,
    }));
    setSubmitResult(JSON.stringify(values, null, 2));
  }, [widgets]);

  return (
    <div
      style={{ display: "flex", height: "100vh", gap: 16, padding: 16, boxSizing: "border-box" }}
    >
      <div style={{ width: 240 }}>
        <h3 style={{ marginTop: 0 }}>拖入表单组件</h3>
        <p style={{ color: "#666", fontSize: 12, marginTop: 0 }}>
          先选择目标单元格，再拖拽或点击组件放置。Delete/Backspace 或“清除内容”可以移除选区内的组件。
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            onClick={() => setMode((prev) => (prev === "edit" ? "preview" : "edit"))}
            style={{
              flex: 1,
              padding: "8px 10px",
              background: mode === "preview" ? "#1677ff" : "#f0f0f0",
              color: mode === "preview" ? "#fff" : "#333",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {mode === "preview" ? "切换到编辑占位" : "切换到预览填写"}
          </button>
          <button
            type="button"
            onClick={clearSelectionContent}
            style={{
              padding: "8px 10px",
              background: "#ff4d4f",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            清除内容
          </button>
        </div>
        {palette}
        <button
          type="button"
          onClick={handleSubmit}
          style={{
            padding: "10px 14px",
            background: "#1677ff",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            width: "100%",
          }}
        >
          提交并读取所有值
        </button>
        {submitResult && (
          <pre
            style={{
              background: "#f7f7f7",
              padding: 12,
              marginTop: 12,
              borderRadius: 8,
              maxHeight: 240,
              overflow: "auto",
              fontSize: 12,
            }}
          >
            {submitResult}
          </pre>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <Workbook ref={workbookRef} data={data} onChange={onChange} cellWidgets={renderedWidgets} hooks={hooks} />
        <div style={{ marginTop: 12, color: "#444", fontSize: 12 }}>
          {selection?.length ? (
            <div>{`当前选区：R${selection[0].row[0] + 1}-R${selection[0].row[1] + 1}, C${selection[0].column[0] + 1}-C${selection[0].column[1] + 1}`}</div>
          ) : (
            <div>选择一个单元格以放置组件。</div>
          )}
          <div style={{ marginTop: 8 }}>
            当前模式：{mode === "preview" ? "预览可填写" : "编辑占位"}；支持：多选插入、双击/输入/选择交互（预览模式）、Delete/清除内容 删除组件。
          </div>
        </div>
      </div>
    </div>
  );
};
