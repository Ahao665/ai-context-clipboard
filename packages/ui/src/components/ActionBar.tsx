export interface ActionBarAction {
  id: string;
  label: string;
  title: string;
  handler: () => void;
}

interface Props {
  actions: ActionBarAction[];
  disabled: boolean;
}

export function ActionBar({ actions, disabled }: Props) {
  if (actions.length === 0) return null;

  return (
    <div className="action-bar">
      {actions.map((action) => (
        <button
          key={action.id}
          className="action-btn"
          onClick={action.handler}
          disabled={disabled}
          title={action.title}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
