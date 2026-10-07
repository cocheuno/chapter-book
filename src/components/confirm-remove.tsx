import { Action, Cancel, Content, Description, Overlay, Portal, Root, Title, Trigger } from "@radix-ui/react-alert-dialog";

/** Asks before a shelf item is removed. */
export function ConfirmRemove({ title, onConfirm }: { title: string; onConfirm: () => void | Promise<void> }) {
  return (
    <Root>
      <Trigger className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-medium text-ink-soft hover:bg-paper-2">
        Remove
      </Trigger>
      <Portal>
        <Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-surface p-6 text-ink shadow-lg">
          <Title className="font-display text-xl">Remove {title} from the site?</Title>
          <Description className="mt-2 text-ink-soft">Its page stops working.</Description>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Cancel className="inline-flex min-h-11 items-center justify-center rounded-md border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-paper-2">
              Keep it
            </Cancel>
            <Action
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-danger px-4 text-sm font-medium text-paper hover:opacity-90"
              onClick={() => {
                void onConfirm();
              }}
            >
              Remove
            </Action>
          </div>
        </Content>
      </Portal>
    </Root>
  );
}
