import { DefaultEvent, type RenderEventArgs } from "@super-calendar/native";

// Native: the base-ui context menu is web-only, so just render the built-in
// event. (Native uses long-press drag-to-move instead.)
export function EventContextMenu(props: RenderEventArgs) {
  return <DefaultEvent {...props} />;
}
