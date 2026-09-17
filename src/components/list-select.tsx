import { Select } from "@/components/ui/field";
import { listItems } from "@/lib/crm/actions";
import type { ListKey } from "@/lib/crm/lists";
import { useEffect, useState } from "react";

export function ListSelect({
  listKey,
  value,
  onChange,
  allowEmpty = true,
  emptyLabel = "—",
}: {
  listKey: ListKey;
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  const [items, setItems] = useState<{ id: string; value: string }[]>([]);
  useEffect(() => {
    listItems({ data: listKey }).then(setItems).catch(() => setItems([]));
  }, [listKey]);
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {items.map((i) => (
        <option key={i.id} value={i.value}>
          {i.value}
        </option>
      ))}
    </Select>
  );
}
