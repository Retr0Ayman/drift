import SegmentedControl from "../ui/SegmentedControl";
import Select from "../ui/Select";
import type { StatusFilter, SortKey } from "../../lib/filters";
import "./FilterBar.css";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "outdated", label: "Outdated" },
  { value: "hv", label: "Hypervisor" },
  { value: "trad", label: "Traditional" },
  { value: "uncracked", label: "Uncracked" },
  { value: "unreleased", label: "Unreleased" },
];

const SORT_OPTIONS = [
  { value: "date-desc", label: "Newest first" },
  { value: "date-asc", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "drift", label: "Most outdated" },
  { value: "survival", label: "Fastest kill" },
];

interface FilterBarProps {
  status: StatusFilter;
  onStatusChange: (v: StatusFilter) => void;
  genre: string;
  onGenreChange: (v: string) => void;
  genres: string[];
  year: string;
  onYearChange: (v: string) => void;
  years: number[];
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
}

export default function FilterBar({
  status,
  onStatusChange,
  genre,
  onGenreChange,
  genres,
  year,
  onYearChange,
  years,
  sort,
  onSortChange,
}: FilterBarProps) {
  const genreOptions = [{ value: "all", label: "All genres" }, ...genres.map((g) => ({ value: g, label: g }))];
  const yearOptions = [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: String(y), label: String(y) }))];

  return (
    <div className="filterbar">
      <SegmentedControl
        options={STATUS_OPTIONS}
        value={status}
        onChange={(v) => onStatusChange(v as StatusFilter)}
        ariaLabel="Filter by status"
      />
      <div className="filterbar-right">
        <Select ariaLabel="Filter by genre" value={genre} onChange={onGenreChange} options={genreOptions} />
        <Select ariaLabel="Filter by year" value={year} onChange={onYearChange} options={yearOptions} />
        <Select ariaLabel="Sort" value={sort} onChange={(v) => onSortChange(v as SortKey)} options={SORT_OPTIONS} />
      </div>
    </div>
  );
}
