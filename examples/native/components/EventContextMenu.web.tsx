import "../global.css";
import { DefaultEvent, type RenderEventArgs } from "@super-calendar/native";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "./ContextMenu";
import { useEventMenuActions } from "./EventMenu";

/**
 * Web renderEvent: wraps the built-in event in a base-ui context menu. Right-click
 * an event to move or delete it. The calendar bundles no menu UI — this lives
 * entirely in the example, showing you can drop in any library (base-ui here).
 */
export function EventContextMenu(props: RenderEventArgs) {
  const actions = useEventMenuActions();
  if (!actions) return <DefaultEvent {...props} />;
  return (
    <ContextMenu>
      <ContextMenuTrigger className="flex grow basis-auto">
        <DefaultEvent {...props} />
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => actions.shift(props.event, -30)}>
          Move 30 min earlier
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.shift(props.event, 30)}>
          Move 30 min later
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.shift(props.event, 60)}>
          Move 1 hour later
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => actions.remove(props.event)}>
          Delete event
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
