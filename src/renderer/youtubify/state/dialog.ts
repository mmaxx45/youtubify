// One app-wide modal dialog (Spotify shows a single one at a time), rendered by DialogHost.

import { markRaw, shallowRef, type Component } from "vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";

export const dialog = shallowRef<{ component: Component; props: Record<string, unknown> } | null>(null);

/** Show a dialog component; it closes itself by emitting "close". */
export function openDialog(component: Component, props: Record<string, unknown> = {}) {
  dialog.value = { component: markRaw(component), props };
}

export const closeDialog = (): void => {
  dialog.value = null;
};

/** Message text where some parts are bold, e.g. the playlist name in "This will delete X from Your Library." */
export type DialogText = (string | { strong: string })[];

export interface ConfirmOptions {
  title: string;
  message: DialogText;
  confirmLabel: string;
  cancelLabel?: string;
}

/** Spotify's light confirmation dialog; resolves true when confirmed. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    openDialog(ConfirmDialog, {
      ...options,
      onResult: (ok: boolean) => {
        closeDialog();
        resolve(ok);
      }
    });
  });
}
