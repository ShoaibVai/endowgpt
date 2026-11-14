import React from 'react';
import { Code2, Eye } from 'lucide-react';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

type PreviewButtonProps = {
  active: boolean;
  onToggle: () => void;
  tabIndex?: number;
  className?: string;
};

const PreviewButton: React.FC<PreviewButtonProps> = ({ active, onToggle, tabIndex, className }) => {
  const localize = useLocalize();
  const label = localize(active ? 'com_ui_code' : 'com_ui_preview');
  const Icon = active ? Code2 : Eye;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={label}
      title={label}
      tabIndex={tabIndex}
      className={cn(
        'text-text-secondary hover:text-text-primary focus-visible:ring-border-xheavy flex items-center gap-1 rounded px-1.5 py-1 whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-hidden',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span className="text-xs">{label}</span>
    </button>
  );
};

export default PreviewButton;
