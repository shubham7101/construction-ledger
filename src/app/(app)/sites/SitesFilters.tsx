"use client";

import type React from "react";
import { Pill } from "@/components/ui/Pill";
import { SearchInput } from "@/components/ui/SearchInput";
import { useUrlParams } from "@/hooks/useUrlParams";
import { SITE_STATUS_LABELS } from "@/lib/format";

type Stage = keyof typeof SITE_STATUS_LABELS;

const STAGES = Object.entries(SITE_STATUS_LABELS) as Array<[Stage, string]>;

/** The Sites list's search box and stage pills (?q / ?stage). */
export const SitesFilters: React.FC<{
  query: string;
  stage: Stage | undefined;
}> = ({ query, stage }) => {
  const { update } = useUrlParams();
  return (
    <div className="space-y-3">
      <SearchInput
        value={query}
        placeholder="🔍 Search name, city or address"
        ariaLabel="Search sites by name, city or address"
      />
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible">
        <Pill
          label="All"
          active={!stage}
          onClick={() => update({ stage: undefined })}
        />
        {STAGES.map(([key, label]) => (
          <Pill
            key={key}
            label={label}
            active={stage === key}
            onClick={() => update({ stage: key })}
          />
        ))}
      </div>
    </div>
  );
};
