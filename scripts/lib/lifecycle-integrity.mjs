export function invalidateCompletedItem(item, { reason, at }) {
  if (item.status !== "done") {
    throw new Error("only completed items can be invalidated");
  }
  item.status = "active";
  delete item.completed_at;
  item.invalidations = [
    ...(item.invalidations ?? []),
    { reason, invalidated_at: at },
  ];
}
