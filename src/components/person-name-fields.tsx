import { Field, Input } from "@/components/ui/field";
import { ListSelect } from "@/components/list-select";
import { listItems } from "@/lib/crm/actions";
import { composePersonName, isDegreeTitle, salutation } from "@/lib/crm/names";
import { useEffect, useState } from "react";

export type PersonNameValue = {
  religiousTitle: string;
  academicTitle: string;
  givenName: string;
  middleName: string;
  familyName: string;
  suffix: string;
  postNominals: string;
  salutationOverride: string;
};

function appendPostNominal(current: string, value: string): string {
  const next = value.trim();
  if (!next) return current;
  const parts = current
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.includes(next)) return current;
  return [...parts, next].join(", ");
}

export function PersonNameFields({
  value,
  onChange,
  includeTitles = true,
}: {
  value: PersonNameValue;
  onChange: (next: PersonNameValue) => void;
  includeTitles?: boolean;
}) {
  const [postNominalChoices, setPostNominalChoices] = useState<{ id: string; value: string }[]>([]);
  useEffect(() => {
    if (!includeTitles) return;
    listItems({ data: "post_nominal" })
      .then(setPostNominalChoices)
      .catch(() => setPostNominalChoices([]));
  }, [includeTitles]);
  const listed = composePersonName(value);
  return (
    <>
      {includeTitles && (
        <>
          <Field label="Religious title">
            <ListSelect
              listKey="religious_title"
              value={value.religiousTitle}
              onChange={(religiousTitle) => onChange({ ...value, religiousTitle })}
            />
          </Field>
          <Field label="Academic title">
            <ListSelect
              listKey="academic_title"
              value={value.academicTitle}
              onChange={(academicTitle) => onChange({ ...value, academicTitle })}
            />
          </Field>
        </>
      )}
      <Field label="First name">
        <Input
          value={value.givenName}
          onChange={(e) => onChange({ ...value, givenName: e.target.value })}
          autoComplete="given-name"
          required
        />
      </Field>
      <Field label="Middle name">
        <Input
          value={value.middleName}
          onChange={(e) => onChange({ ...value, middleName: e.target.value })}
          autoComplete="additional-name"
          placeholder="Anne or A."
        />
      </Field>
      <Field label="Last name">
        <Input
          value={value.familyName}
          onChange={(e) => onChange({ ...value, familyName: e.target.value })}
          autoComplete="family-name"
          required
        />
      </Field>
      <Field label="Suffix">
        <Input
          value={value.suffix}
          onChange={(e) => onChange({ ...value, suffix: e.target.value })}
          autoComplete="honorific-suffix"
          placeholder="Jr., III"
          maxLength={12}
        />
      </Field>
      {includeTitles && (
        <div className="sm:col-span-2">
          <Field label="Post-nominals">
            <Input
              value={value.postNominals}
              onChange={(e) => onChange({ ...value, postNominals: e.target.value })}
              placeholder="S.J., Ph.D."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {postNominalChoices.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="rounded-full bg-paper-2 px-2 py-0.5 text-xs text-ink"
                  onClick={() => onChange({ ...value, postNominals: appendPostNominal(value.postNominals, item.value) })}
                >
                  {item.value}
                </button>
              ))}
              {isDegreeTitle(value.academicTitle) && (
                <button
                  type="button"
                  className="rounded-full border border-line px-2 py-0.5 text-xs text-ink"
                  onClick={() =>
                    onChange({
                      ...value,
                      academicTitle: "",
                      postNominals: appendPostNominal(value.postNominals, value.academicTitle),
                    })
                  }
                >
                  Move {value.academicTitle} to post-nominals
                </button>
              )}
            </div>
          </Field>
        </div>
      )}
      {listed ? (
        <p className="sm:col-span-2 text-sm text-ink-soft">
          Listed as <span className="font-medium text-ink">{listed}</span>
        </p>
      ) : null}
      {includeTitles && (
        <p className="sm:col-span-2 text-sm text-ink-soft">
          Salutation: <span className="font-medium text-ink">{salutation(value)},</span>
        </p>
      )}
      {includeTitles && (
        <div className="sm:col-span-2">
          <Field label="Salutation override">
            <Input
              value={value.salutationOverride}
              onChange={(e) => onChange({ ...value, salutationOverride: e.target.value })}
              placeholder="Dear Sister Kowalski"
            />
            <p className="mt-1 text-xs text-muted">
              Leave blank to use the salutation above. Typed text is used exactly as written.
            </p>
          </Field>
        </div>
      )}
    </>
  );
}
