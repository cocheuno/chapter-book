import { Field } from "@/components/ui/field";
import { siteImageSrc } from "@/lib/crm/site-image";
import { useEffect, useState } from "react";

export function PictureField({
  label,
  imageId,
  file,
  onFile,
  onClear,
}: {
  label: string;
  imageId: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onClear: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const src = preview || siteImageSrc(imageId);
  return (
    <Field label={label}>
      <p className="text-sm text-ink-soft">JPEG, PNG, GIF, or WebP from your computer. Up to 1.5 MB.</p>
      {src ? <img src={src} alt="" className="mt-2 max-h-40 w-full rounded-lg object-cover" /> : null}
      <input
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
        className="mt-2 block min-h-11 w-full text-sm"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {src ? (
        <button type="button" className="mt-2 min-h-11 text-sm text-bronze" onClick={onClear}>
          Remove picture
        </button>
      ) : null}
    </Field>
  );
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read that picture"));
    reader.readAsDataURL(file);
  });
}
