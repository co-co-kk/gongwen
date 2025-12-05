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

type WidgetTemplateKey = "text" | "select" | "note" | "upload";

type WidgetInstance = {
  id: string;
  r: number;
  c: number;
  sheetId: string;
  template: WidgetTemplateKey;
  value: string;
  required?: boolean;
  assets?: string[];
};

type TemplateConfig = {
  label: string;
  color: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  editHeight?: number;
  previewHeight?: number;
};

const templates: Record<WidgetTemplateKey, TemplateConfig> = {
  text: {
    label: "输入框 (必填)",
    color: "#3478f6",
    required: true,
    placeholder: "请输入内容",
    editHeight: 30,
    previewHeight: 40,
  },
  select: {
    label: "下拉框",
    color: "#52c41a",
    options: ["选项A", "选项B", "选项C"],
    placeholder: "请选择",
    editHeight: 30,
    previewHeight: 40,
  },
  note: { label: "备注标签", color: "#fa8c16", editHeight: 28, previewHeight: 36 },
  upload: {
    label: "图片上传",
    color: "#722ed1",
    placeholder: "上传图片",
    editHeight: 30,
    previewHeight: 140,
  },
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

const findMergeRange = (
  sheet: Sheet | undefined,
  row: number,
  column: number
): { r: number; c: number; rs: number; cs: number } => {
  const merge = sheet?.config?.merge;
  if (!merge) return { r: row, c: column, rs: 1, cs: 1 };

  for (const key of Object.keys(merge)) {
    const block = merge[key];
    if (
      row >= block.r &&
      row < block.r + block.rs &&
      column >= block.c &&
      column < block.c + block.cs
    ) {
      return { r: block.r, c: block.c, rs: block.rs, cs: block.cs };
    }
  }

  return { r: row, c: column, rs: 1, cs: 1 };
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
  const [managerCell, setManagerCell] = useState<{ r: number; c: number; sheetId: string } | null>(null);
  const defaultRowHeight = 19;

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
          assets: templateKey === "upload" ? [] : undefined,
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
        // Allow multiple widgets per cell; just append to the existing list for the same cell.
        return [...prev, ...instances];
      });
    },
    [activeSheetId, createWidgetInstances, getCurrentSheet]
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
  }, [getCurrentSheetId, removeWidgetsInSelection]);

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
    setManagerCell(null);
  }, [getCurrentSheetId, removeWidgetsInSelection]);

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
        setManagerCell(null);
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
        setManagerCell(null);
      },
      afterAddSheet: (sheet: Sheet) => {
        setActiveSheetId(sheet.id);
      },
    }),
    [activeSheetId, getCurrentSheetId, removeWidgets]
  );

  const groupedWidgets = useMemo(() => {
    const map = new Map<string, WidgetInstance[]>();
    widgets.forEach((widget) => {
      const key = `${widget.sheetId}-${widget.r}-${widget.c}`;
      map.set(key, [...(map.get(key) || []), widget]);
    });
    return Array.from(map.entries()).map(([key, group]) => ({
      key,
      cell: { sheetId: group[0].sheetId, r: group[0].r, c: group[0].c },
      items: group,
    }));
  }, [widgets]);

  const getWidgetHeights = useCallback((widget: WidgetInstance) => {
    const cfg = templates[widget.template];
    const editHeight = cfg.editHeight ?? 30;
    const previewBase = cfg.previewHeight ?? 40;
    if (widget.template === "upload" && widget.assets?.length) {
      return {
        edit: editHeight,
        preview: previewBase + (widget.assets.length - 1) * 110,
      };
    }
    return { edit: editHeight, preview: previewBase };
  }, []);

  useEffect(() => {
    const rowHeightsBySheet = new Map<string, Map<number, number>>();

    const getCurrentRowHeight = (sheetId: string, row: number) =>
      rowHeightsBySheet.get(sheetId)?.get(row) ?? defaultRowHeight;

    const setRowHeightForSheet = (sheetId: string, row: number, height: number) => {
      const sheetHeights = rowHeightsBySheet.get(sheetId) ?? new Map<number, number>();
      sheetHeights.set(row, height);
      rowHeightsBySheet.set(sheetId, sheetHeights);
    };

    const ensureRangeHeight = (
      sheetId: string,
      startRow: number,
      rowSpan: number,
      requiredHeight: number
    ) => {
      const currentTotal = Array.from({ length: rowSpan }).reduce((sum, _, idx) => {
        const rowIndex = startRow + idx;
        return sum + getCurrentRowHeight(sheetId, rowIndex);
      }, 0);

      if (currentTotal === requiredHeight) return;

      if (currentTotal < requiredHeight) {
        const extra = requiredHeight - currentTotal;
        const firstRowHeight = getCurrentRowHeight(sheetId, startRow);
        setRowHeightForSheet(sheetId, startRow, firstRowHeight + extra);
      } else {
        // Shrink only the first row when the current height exceeds the requirement.
        const excess = currentTotal - requiredHeight;
        const firstRowHeight = getCurrentRowHeight(sheetId, startRow);
        setRowHeightForSheet(sheetId, startRow, Math.max(defaultRowHeight, firstRowHeight - excess));
      }
    };

    groupedWidgets.forEach((group) => {
      const sheet = data.find((s) => s.id === group.cell.sheetId);
      if (!sheet) return;

      const mergeRange = findMergeRange(sheet, group.cell.r, group.cell.c);

      const stackHeight = group.items.reduce((sum, item, idx) => {
        const heights = getWidgetHeights(item);
        return sum + (mode === "preview" ? heights.preview : heights.edit) + (idx > 0 ? 8 : 0);
      }, 0);

      const desiredHeight = Math.max(defaultRowHeight, stackHeight + (mode === "preview" ? 12 : 6));

      ensureRangeHeight(group.cell.sheetId, mergeRange.r, mergeRange.rs, desiredHeight);
    });

    setData((prev) => {
      let changed = false;
      const next = prev.map((sheet) => {
        const heights = rowHeightsBySheet.get(sheet.id);
        const newRowlen: Record<string, number> = {};
        heights?.forEach((height, row) => {
          newRowlen[row] = height;
        });

        const currentRowlen = sheet.config?.rowlen ?? {};
        const sameLength = Object.keys(newRowlen).length === Object.keys(currentRowlen).length;
        const equal =
          sameLength &&
          Object.keys(newRowlen).every(
            (key) => Number(currentRowlen[key]) === Number(newRowlen[key])
          );

        if (equal) return sheet;

        changed = true;
        return {
          ...sheet,
          config: {
            ...(sheet.config ?? {}),
            rowlen: newRowlen,
          },
        };
      });

      return changed ? next : prev;
    });
  }, [data, defaultRowHeight, getWidgetHeights, groupedWidgets, mode]);

  const renderedWidgets: CellWidget[] = useMemo(() => {
    return groupedWidgets.map((group) => {
      const children = group.items.map((widget) => {
        const template = templates[widget.template];
        const readonly = mode === "edit";
        const pointerEvents = readonly ? "none" : "auto";

        let node: React.ReactNode = null;
        if (widget.template === "text") {
          node = (
            <input
              type="text"
              value={widget.value}
              placeholder={template.placeholder}
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
        } else if (widget.template === "upload") {
          const assets = widget.assets ?? [];
          node = (
            <div
              style={{
                width: "100%",
                height: "100%",
                border: `1px dashed ${template.color}`,
                borderRadius: 8,
                padding: 8,
                boxSizing: "border-box",
                background: readonly ? "#fafafa" : "#fff",
                pointerEvents,
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {assets.length === 0 && (
                <div style={{ color: template.color, fontSize: 12 }}>{template.placeholder}</div>
              )}
              {assets.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 6,
                    overflow: "hidden",
                    background: "#f5f5f5",
                    border: `1px solid ${template.color}`,
                  }}
                >
                  <img
                    src={url}
                    alt="upload"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              ))}
              {!readonly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const newAsset = `https://picsum.photos/seed/${Math.round(Math.random() * 10000)}/160`;
                    setWidgets((prev) =>
                      prev.map((item) =>
                        item.id === widget.id
                          ? { ...item, assets: [...(item.assets || []), newAsset] }
                          : item
                      )
                    );
                  }}
                  style={{
                    padding: "6px 10px",
                    border: `1px solid ${template.color}`,
                    borderRadius: 6,
                    background: "#fff",
                    color: template.color,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  + 添加图片
                </button>
              )}
            </div>
          );
        } else {
          node = (
            <div
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

        const { edit, preview } = getWidgetHeights(widget);
        const targetHeight = mode === "preview" ? preview : edit;

        return (
          <div
            key={widget.id}
            style={{
              width: "100%",
              height: targetHeight,
              minHeight: 24,
              background: "#fff",
              borderRadius: 8,
              border: `1px solid ${template.color}`,
              boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
              overflow: "hidden",
              position: "relative",
              opacity: mode === "edit" ? 0.9 : 1,
              padding: mode === "edit" ? "0 10px" : 0,
              display: "flex",
              alignItems: mode === "edit" ? "center" : "stretch",
              boxSizing: "border-box",
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
            {mode === "edit" ? (
              <div style={{ color: template.color, fontWeight: 500, fontSize: 13 }}>
                {template.label}
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
        );
      });

      const totalHeight = group.items.reduce((sum, item, idx) => {
        const heights = getWidgetHeights(item);
        return sum + (mode === "preview" ? heights.preview : heights.edit) + (idx > 0 ? 8 : 0);
      }, 0);

      return {
        id: `group-${group.key}`,
        r: group.cell.r,
        c: group.cell.c,
        sheetId: group.cell.sheetId,
        passthroughEvents: mode === "edit",
        height: mode === "preview" ? totalHeight : undefined,
        node: (
          <div
            style={{
              width: "100%",
              height: "100%",
              overflowY: mode === "edit" ? "auto" : "visible",
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: mode === "edit" ? 4 : 0,
              boxSizing: "border-box",
              background: mode === "edit" ? "#fafafa" : "#fff",
            }}
          >
            {children}
          </div>
        ),
      } as CellWidget;
    });
  }, [getWidgetHeights, groupedWidgets, mode, setWidgets, updateWidgetValue, validationErrors]);

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

  const handleGridDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      const currentSelection = workbookRef.current?.getSelection();
      const currentSheetId = getCurrentSheetId();
      if (!currentSelection?.length || !currentSheetId) return;

      const range = currentSelection[0];
      const target = { r: range.row[0], c: range.column[0] };
      const hasWidgets = widgets.some(
        (w) => w.sheetId === currentSheetId && w.r === target.r && w.c === target.c
      );
      if (hasWidgets) {
        setManagerCell({ ...target, sheetId: currentSheetId });
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [getCurrentSheetId, widgets]
  );

  const managerItems = useMemo(() => {
    if (!managerCell) return [];
    return widgets.filter(
      (w) => w.sheetId === managerCell.sheetId && w.r === managerCell.r && w.c === managerCell.c
    );
  }, [managerCell, widgets]);

  const replaceWidget = useCallback(
    (widgetId: string, templateKey: WidgetTemplateKey) => {
      setWidgets((prev) =>
        prev.map((w) =>
          w.id === widgetId
            ? {
                ...w,
                template: templateKey,
                value: "",
                assets: templateKey === "upload" ? [] : undefined,
                required: templates[templateKey].required,
              }
            : w
        )
      );
    },
    []
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
      value: widget.template === "upload" ? widget.assets ?? [] : widget.value,
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
      <div
        style={{ flex: 1, minWidth: 0, position: "relative" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onDoubleClick={handleGridDoubleClick}
      >
        <Workbook ref={workbookRef} data={data} onChange={onChange} cellWidgets={renderedWidgets} hooks={hooks} />
        {managerCell && managerItems.length > 0 && (
          <div
            style={{
              position: "absolute",
              right: 12,
              top: 12,
              width: 260,
              background: "#fff",
              border: "1px solid #d9d9d9",
              borderRadius: 8,
              boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
              padding: 12,
              zIndex: 10,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>单元格组件管理</div>
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
              双击单元格进入，可替换或删除其中的组件。
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {managerItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #f0f0f0",
                    borderRadius: 6,
                    padding: 8,
                    background: "#fafafa",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 72, fontSize: 12, color: "#555" }}>组件</span>
                    <select
                      value={item.template}
                      onChange={(e) => replaceWidget(item.id, e.target.value as WidgetTemplateKey)}
                      style={{ flex: 1, padding: "4px 6px" }}
                    >
                      {(Object.keys(templates) as WidgetTemplateKey[]).map((key) => (
                        <option key={key} value={key}>
                          {templates[key].label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 72, fontSize: 12, color: "#555" }}>操作</span>
                    <button
                      type="button"
                      onClick={() => removeWidgets((w) => w.id === item.id)}
                      style={{
                        padding: "6px 10px",
                        border: "1px solid #ff7875",
                        background: "#fff1f0",
                        color: "#cf1322",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: "right" }}>
              <button
                type="button"
                onClick={() => setManagerCell(null)}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #d9d9d9",
                  borderRadius: 6,
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                关闭
              </button>
            </div>
          </div>
        )}
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
