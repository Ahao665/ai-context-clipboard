import { CONTENT_TYPE_ICONS, CONTENT_TYPE_LABELS } from '@ai-clipboard/core';
import type { ContentType } from '@ai-clipboard/types';

/** Types offered as filter chips, in display order. */
const FILTERABLE: ContentType[] = ['url', 'code', 'json', 'email', 'text'];

interface Props {
  active: ContentType | null;
  onChange: (contentType: ContentType | null) => void;
}

/**
 * Content-type filter chips for the palette.
 *
 * Selecting a chip narrows both browse mode and search results. Clicking the
 * active chip again clears the filter, so the control never traps the user.
 */
export function TypeFilter({ active, onChange }: Props) {
  return (
    <div className="type-filter" role="group" aria-label="按内容类型筛选">
      <button
        type="button"
        className={`type-chip ${active === null ? 'active' : ''}`}
        onClick={() => onChange(null)}
        aria-pressed={active === null}
      >
        全部
      </button>
      {FILTERABLE.map((type) => {
        const isActive = active === type;
        return (
          <button
            key={type}
            type="button"
            className={`type-chip ${isActive ? 'active' : ''}`}
            // Toggle off when the active chip is clicked again.
            onClick={() => onChange(isActive ? null : type)}
            aria-pressed={isActive}
            title={`只看${CONTENT_TYPE_LABELS[type]}`}
          >
            {CONTENT_TYPE_ICONS[type]} {CONTENT_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}
