export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

let todos: TodoItem[] = [];
let seq = 0;

export function listTodos(): TodoItem[] {
  return [...todos];
}

export function clearTodos(): void {
  todos = [];
}

export function todoWrite(items: Array<{
  content: string;
  status?: TodoItem["status"];
  id?: string;
}>): TodoItem[] {
  todos = items.map((it) => ({
    id: it.id || `t${++seq}`,
    content: it.content,
    status: it.status ?? "pending",
  }));
  return listTodos();
}

export function todoUpdate(
  id: string,
  patch: Partial<Pick<TodoItem, "content" | "status">>,
): TodoItem | null {
  const t = todos.find((x) => x.id === id);
  if (!t) return null;
  if (patch.content != null) t.content = patch.content;
  if (patch.status != null) t.status = patch.status;
  return { ...t };
}

export function formatTodos(): string {
  if (!todos.length) return "(no todos)";
  return todos
    .map((t) => {
      const mark =
        t.status === "completed"
          ? "✓"
          : t.status === "in_progress"
            ? "►"
            : t.status === "cancelled"
              ? "✗"
              : "○";
      return `${mark} [${t.id}] ${t.content} (${t.status})`;
    })
    .join("\n");
}
