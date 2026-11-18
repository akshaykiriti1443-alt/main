"use client";

import { rememberAdCountryAction } from "@/actions/adResearch";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

/**
 * The Country box on Ad research and Ad studio. A pick is kept straight away, so the other screen
 * starts on the same country (Meta's own search opens in a new tab and never reaches our server).
 */
export function CountrySelect({ wid, id, name = "country", defaultValue, options }: { wid: string; id: string; name?: string; defaultValue: string; options: [string, string][] }) {
  return (
    <NativeSelect
      id={id}
      name={name}
      defaultValue={defaultValue}
      className="w-full"
      onChange={(e) => {
        rememberAdCountryAction(wid, e.currentTarget.value).catch(() => {});
      }}
    >
      {options.map(([c, label]) => (
        <NativeSelectOption key={c} value={c}>
          {label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
