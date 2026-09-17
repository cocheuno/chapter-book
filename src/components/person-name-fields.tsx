import { Field, Input } from "@/components/ui/field";
import { ListSelect } from "@/components/list-select";
import { composePersonName } from "@/lib/crm/names";

export type PersonNameValue = {
  religiousTitle: string;
  academicTitle: string;
  givenName: string;
  middleName: string;
  familyName: string;
  suffix: string;
};

export function PersonNameFields({
  value,
  onChange,
  includeTitles = true,
}: {
  value: PersonNameValue;
  onChange: (next: PersonNameValue) => void;
  includeTitles?: boolean;
}) {
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
      {listed ? (
        <p className="sm:col-span-2 text-sm text-ink-soft">
          Listed as <span className="font-medium text-ink">{listed}</span>
        </p>
      ) : null}
    </>
  );
}
